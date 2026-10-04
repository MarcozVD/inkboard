// transfer — import, export and downloads (§M1-01, B13/B16).
// M2-06 adds the `.inkboard` archive (Tauri only, Rust crate zip) and M2-07
// wires the internal JSON import (new board or insert as one undo step).
import { invoke } from '@tauri-apps/api/core';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { Board, CameraState, CanvasObject, GridConfig, ImageObject } from '$lib/objects/types';
import { createText } from '$lib/objects/factory';
import { AddObjectsCommand } from '$lib/canvas/commands';
import { createVersion } from '$lib/io/persistence';
import { resolveAssetSources } from '$lib/io/assets';
import { createBoardFromImport, insertImportedBoard, validateBoardFile } from '$lib/io/importBoard';
import { SCHEMA_VERSION, serializeBoard } from '$lib/io/InternalFormat';
import { boardToSvg } from '$lib/io/SvgExporter';
import { boardToImageDataUrl } from '$lib/io/PngExporter';
import { computeExportFrame, clampScale, type ExportMode, type ExportScale } from '$lib/io/exportRegion';
import { insertImportedStickies } from '$lib/io/msWhiteboard';
import { cssVar } from '$lib/objects/colors';
import { themeController } from '$lib/board/theme.svelte';
import { showNotice } from '$lib/stores/ui.svelte';

export type ExportFormat = 'svg' | 'png' | 'json' | 'inkboard';
/** `new` imports the file as a standalone board; `current` inserts it. */
export type ImportMode = 'new' | 'current';

/** Options for image exports (M2-09). */
export interface ExportImageOptions {
	format: 'png' | 'jpeg' | 'svg';
	mode: ExportMode;
	scale: ExportScale;
	/** JPEG quality 0..1 */
	quality?: number;
	/** PNG/SVG only */
	transparent?: boolean;
}

export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface TransferMeta {
	name: string;
	camera: CameraState;
	grid: GridConfig;
	createdAt: number;
	view: { width: number; height: number };
}

export interface TransferContext {
	engine: CanvasEngine;
	boardId: string;
	getMeta: () => TransferMeta;
	onDirty?: () => void;
}

export interface TransferHost {
	getBoardId: () => string;
	getEngine: () => CanvasEngine | null;
	getMeta: () => TransferMeta;
	onDirty: () => void;
	/** persist pending edits before a full-board export (`.inkboard`) */
	flush?: () => Promise<void>;
	/** navigate to a board created by an import-as-new */
	onImportedBoard?: (board: Board) => void;
}

/** Bound export/import actions for a board component. */
export function createTransferHandlers(host: TransferHost) {
	const context = (engine: CanvasEngine): TransferContext => ({
		engine,
		boardId: host.getBoardId(),
		getMeta: host.getMeta,
		onDirty: host.onDirty
	});
	return {
		export(format: ExportFormat): void {
			const engine = host.getEngine();
			if (!engine) return;
			if (format === 'png' || format === 'svg') {
				void exportImage(context(engine), { format, mode: 'board', scale: format === 'png' ? 2 : 1 });
				return;
			}
			void exportBoard(context(engine), format, { flush: host.flush });
		},
		exportImage(options: ExportImageOptions): void {
			const engine = host.getEngine();
			if (engine) void exportImage(context(engine), options);
		},
		/** Context-menu action (M1-11): selection as PNG. */
		exportSelection(): void {
			const engine = host.getEngine();
			if (engine) void exportImage(context(engine), { format: 'png', mode: 'selection', scale: 2 });
		},
		async import(mode: ImportMode = 'new'): Promise<void> {
			const engine = host.getEngine();
			if (!engine) return;
			// M2-04: snapshot the live board before importing anything
			try {
				await createVersion(host.getBoardId(), 'Before import');
			} catch (err) {
				console.error('pre-import version failed', err);
			}
			await importFile(context(engine), mode, host);
		}
	};
}

// ── downloads ──

export function downloadFile(filename: string, content: string, mime: string): void {
	downloadBlob(filename, new Blob([content], { type: mime }));
}

export function downloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

// ── export ──

/** JSON / `.inkboard` document exports (PNG/JPG/SVG go through exportImage). */
export async function exportBoard(
	ctx: TransferContext,
	format: ExportFormat,
	opts: { flush?: () => Promise<void> } = {}
): Promise<void> {
	const meta = ctx.getMeta();
	const base = `inkboard-${ctx.boardId.slice(0, 8)}`;
	try {
		if (format === 'inkboard') {
			// M2-06/M2-08: Rust opens the save dialog and builds the ZIP from the
			// persisted board + asset store (no paths from the webview).
			// Browser builds are not supported; the menu hides this outside Tauri.
			if (!isTauri()) return;
			await opts.flush?.();
			await invoke('export_inkboard', { boardId: ctx.boardId });
			return;
		}
		// M2-05: exported files are portable — asset refs become inline data URLs
		const objects = await resolveAssetSources(ctx.engine.store.toJSON());
		const board: Board = {
			id: ctx.boardId,
			workspaceId: 'default',
			name: meta.name,
			version: 1,
			schemaVersion: SCHEMA_VERSION,
			createdAt: meta.createdAt,
			updatedAt: Date.now(),
			camera: meta.camera,
			objects,
			background: { type: 'solid', color: '#0f1013' },
			grid: meta.grid,
			metadata: {}
		};
		downloadFile(`${base}.json`, serializeBoard(board), 'application/json');
	} catch (err) {
		console.error('export failed', err);
	}
}

/**
 * Image export (M2-09): PNG/JPG/SVG with mode (board/selection/viewport),
 * scale 1×–4× and optional transparent background.
 */
export async function exportImage(ctx: TransferContext, options: ExportImageOptions): Promise<void> {
	const engine = ctx.engine;
	const all = engine.store.toJSON();
	const selection = engine.selectionManager.selected
		.map((id) => engine.store.get(id))
		.filter(Boolean) as CanvasObject[];
	if (options.mode === 'selection' && selection.length === 0) return;

	const meta = ctx.getMeta();
	const scale = clampScale(options.scale);
	const frame = computeExportFrame({
		objects: all,
		mode: options.mode,
		camera: meta.camera,
		view: meta.view,
		scale,
		selection
	});
	if (!frame) return;

	const theme = themeController.resolved;
	const pageBg = cssVar('--color-bg', theme === 'light' ? '#f5f5f7' : '#0f1013');
	const transparent = !!options.transparent && options.format !== 'jpeg';
	const source = options.mode === 'selection' ? selection : all;
	const objects = await resolveAssetSources(source);
	const base =
		options.mode === 'selection'
			? `inkboard-selection-${Date.now()}`
			: options.mode === 'viewport'
				? `inkboard-visible-${Date.now()}`
				: `inkboard-${ctx.boardId.slice(0, 8)}`;
	try {
		if (options.format === 'svg') {
			const svg = boardToSvg(objects, {
				theme,
				region: frame.region,
				width: frame.width,
				height: frame.height,
				background: transparent ? undefined : pageBg
			});
			await saveExportFile(new Blob([svg], { type: 'image/svg+xml' }), `${base}.svg`);
			return;
		}
		const getImage = createImageGetter();
		await preloadImages(objects, getImage);
		const dataUrl = await boardToImageDataUrl(objects, {
			format: options.format,
			scale,
			quality: options.quality,
			background: transparent ? null : pageBg,
			region: frame.region,
			theme,
			getImage
		});
		const res = await fetch(dataUrl);
		await saveExportFile(await res.blob(), `${base}.${options.format === 'jpeg' ? 'jpg' : 'png'}`);
	} catch (err) {
		console.error('image export failed', err);
	}
}

/** Tauri: Rust opens the native save dialog; browser: `<a download>` (M2-09). */
async function saveExportFile(blob: Blob, filename: string): Promise<void> {
	if (isTauri()) {
		const bytes = new Uint8Array(await blob.arrayBuffer());
		await invoke('save_export', bytes, { headers: { 'x-name': filename } });
		return;
	}
	downloadBlob(filename, blob);
}

/** Loader for offscreen renders; exporters pass it to `renderObject`. */
function createImageGetter(): (src: string) => HTMLImageElement {
	const cache = new Map<string, HTMLImageElement>();
	return (src: string): HTMLImageElement => {
		let img = cache.get(src);
		if (!img) {
			img = new Image();
			img.src = src;
			cache.set(src, img);
		}
		return img;
	};
}

/** Wait for every image source to decode so offscreen exports include them. */
async function preloadImages(objects: CanvasObject[], getImage: (src: string) => HTMLImageElement): Promise<void> {
	const images = objects.filter((obj): obj is ImageObject => obj.type === 'image');
	await Promise.all(
		images.map(
			(obj) =>
				new Promise<void>((resolve) => {
					const img = getImage(obj.src);
					if (img.complete) {
						resolve();
						return;
					}
					img.onload = () => resolve();
					img.onerror = () => resolve();
				})
		)
	);
}

// ── images via clipboard / drag & drop ──

/** Paste an image from the system clipboard, centered in the viewport. */
export function pasteImage(ctx: TransferContext, e: ClipboardEvent): void {
	const items = e.clipboardData?.items;
	if (!items) return;
	for (const item of items) {
		if (!item.type.startsWith('image/')) continue;
		const file = item.getAsFile();
		if (!file) continue;
		e.preventDefault();
		const { camera, view } = ctx.getMeta();
		const wx = (view.width / 2 - camera.x) / camera.zoom;
		const wy = (view.height / 2 - camera.y) / camera.zoom;
		const reader = new FileReader();
		reader.onload = () => {
			ctx.engine.imageTool.insertImage(reader.result as string, file.name, wx, wy);
		};
		reader.readAsDataURL(file);
	}
}

/** Drop an image file at a world position. */
export function dropImage(ctx: TransferContext, e: DragEvent, world: { x: number; y: number }): void {
	const files = e.dataTransfer?.files;
	if (!files || files.length === 0) return;
	const file = files[0];
	if (!file.type.startsWith('image/')) return;
	const reader = new FileReader();
	reader.onload = () => {
		ctx.engine.imageTool.insertImage(reader.result as string, file.name, world.x, world.y);
	};
	reader.readAsDataURL(file);
}

// ── import ──

/** Payload returned by the Rust `import_pick` command (M2-08). */
type ImportPayload =
	| { format: 'json' | 'inkboard'; name: string; boardJson: string }
	| { format: 'ms_whiteboard_zip'; name: string; title?: string | null; texts?: string[] }
	| { format: 'image'; name: string; src: string; mime: string; width: number; height: number };

export async function importFile(
	ctx: TransferContext,
	mode: ImportMode = 'new',
	host?: Pick<TransferHost, 'onImportedBoard'>
): Promise<void> {
	// M2-08: in Tauri the whole pick + parse + sanitize happens in Rust; the
	// webview never sees or passes a filesystem path.
	if (isTauri()) {
		try {
			const payload = await invoke<ImportPayload | null>('import_pick');
			if (!payload) return;
			await applyImportPayload(ctx, payload, mode, host);
		} catch (err) {
			console.error('import failed', err);
		}
		return;
	}

	const file = await pickFileFallback();
	if (!file) return;

	if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
		// M2-07: internal JSON import works in the browser too
		await finishBoardImport(ctx, await file.text(), mode, host);
		return;
	}
	if (file.type.startsWith('image/')) {
		const reader = new FileReader();
		reader.onload = () => {
			ctx.engine.imageTool.insertImage(reader.result as string, file.name, 0, 0);
		};
		reader.readAsDataURL(file);
	} else {
		// legacy fallback: any other file imports as plain text lines
		const text = await file.text();
		insertImportedTexts(ctx.engine, null, text.split('\n').filter(Boolean));
	}
	ctx.onDirty?.();
}

/** Apply a Rust `import_pick` payload to the live session. */
async function applyImportPayload(
	ctx: TransferContext,
	payload: ImportPayload,
	mode: ImportMode,
	host?: Pick<TransferHost, 'onImportedBoard'>
): Promise<void> {
	switch (payload.format) {
		case 'json':
		case 'inkboard':
			await finishBoardImport(ctx, payload.boardJson, mode, host);
			return;
		case 'ms_whiteboard_zip': {
			// M2-11: extracted texts become stickies centered on the viewport,
			// as one undo step, with an honest note about the partial scope.
			const meta = ctx.getMeta();
			const center = {
				x: (meta.view.width / 2 - meta.camera.x) / meta.camera.zoom,
				y: (meta.view.height / 2 - meta.camera.y) / meta.camera.zoom
			};
			const count = insertImportedStickies(ctx.engine, payload.title, payload.texts ?? [], center);
			if (count > 0) {
				showNotice(
					`Imported ${count} text ${count === 1 ? 'note' : 'notes'} as stickies — MS Whiteboard exports only text, not ink or shapes.`
				);
			}
			ctx.onDirty?.();
			return;
		}
		case 'image':
			// Rust already sanitized and stored the asset (M2-08)
			ctx.engine.imageTool.insertAsset(payload.src, payload.name);
			ctx.onDirty?.();
			return;
	}
}

/** Validate and apply an internal JSON board payload (M2-06/M2-07). */
async function finishBoardImport(
	ctx: TransferContext,
	json: string,
	mode: ImportMode,
	host?: Pick<TransferHost, 'onImportedBoard'>
): Promise<void> {
	let board: Board;
	try {
		board = validateBoardFile(json);
	} catch (err) {
		console.error('import rejected', err);
		return;
	}
	if (mode === 'current') {
		await insertImportedBoard(ctx.engine, board);
		ctx.onDirty?.();
		return;
	}
	const created = await createBoardFromImport(board);
	host?.onImportedBoard?.(created);
}

/** Import texts as one undoable step (B13) through the mutation API. */
export function insertImportedTexts(engine: CanvasEngine, title: string | null | undefined, texts: string[]): void {
	const lines = [...(title ? [title] : []), ...texts];
	if (lines.length === 0) return;
	const objs = lines.map((line, i) => createText(40 + (i % 4) * 30, 40 + i * 60, line, { fontSize: 18 }));
	engine.execute(new AddObjectsCommand(engine.store, objs));
}

function pickFileFallback(): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml,application/zip,application/json';
		input.onchange = () => resolve(input.files?.[0] ?? null);
		input.oncancel = () => resolve(null);
		input.click();
	});
}
