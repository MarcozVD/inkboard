// transfer — import, export and downloads (§M1-01, B13/B16).
// M2-06 adds the `.inkboard` archive (Tauri only, Rust crate zip) and M2-07
// wires the internal JSON import (new board or insert as one undo step).
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { Board, CameraState, CanvasObject, GridConfig, ImageObject } from '$lib/objects/types';
import { createText } from '$lib/objects/factory';
import { AddObjectsCommand } from '$lib/canvas/commands';
import { createVersion } from '$lib/io/persistence';
import { resolveAssetSources } from '$lib/io/assets';
import { createBoardFromImport, insertImportedBoard, validateBoardFile } from '$lib/io/importBoard';
import { SCHEMA_VERSION, serializeBoard } from '$lib/io/InternalFormat';
import { boardToSvg } from '$lib/io/SvgExporter';
import { boardToPngDataUrl } from '$lib/io/PngExporter';
import { cssVar } from '$lib/objects/colors';
import { themeController } from '$lib/board/theme.svelte';

export type ExportFormat = 'svg' | 'png' | 'json' | 'inkboard';
/** `new` imports the file as a standalone board; `current` inserts it. */
export type ImportMode = 'new' | 'current';

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
			if (engine) void exportBoard(context(engine), format, { flush: host.flush });
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

export async function exportBoard(
	ctx: TransferContext,
	format: ExportFormat,
	opts: { flush?: () => Promise<void> } = {}
): Promise<void> {
	const meta = ctx.getMeta();
	const base = `inkboard-${ctx.boardId.slice(0, 8)}`;
	try {
		if (format === 'inkboard') {
			// M2-06: Rust builds the ZIP from the persisted board + asset store.
			// Browser builds are not supported (no zip crate / IndexedDB assets);
			// the menu hides this option outside Tauri.
			if (!isTauri()) return;
			await opts.flush?.();
			const path = await saveDialog({
				defaultPath: `${sanitizeFilename(meta.name)}.inkboard`,
				filters: [{ name: 'Inkboard board', extensions: ['inkboard'] }]
			});
			if (!path) return;
			await invoke('export_inkboard', { boardId: ctx.boardId, path });
			return;
		}

		// M2-05: exported files are portable — asset refs become inline data URLs
		const objects = await resolveAssetSources(ctx.engine.store.toJSON());
		if (format === 'svg') {
			const theme = themeController.resolved;
			downloadFile(
				`${base}.svg`,
				boardToSvg(objects, { theme, background: cssVar('--color-bg', theme === 'light' ? '#f5f5f7' : '#0f1013') }),
				'image/svg+xml'
			);
			return;
		}
		if (format === 'png') {
			const theme = themeController.resolved;
			const getImage = createImageGetter();
			await preloadImages(objects, getImage);
			const dataUrl = await boardToPngDataUrl(objects, {
				scale: 2,
				theme,
				background: cssVar('--color-bg', theme === 'light' ? '#f5f5f7' : '#0f1013'),
				getImage
			});
			const res = await fetch(dataUrl);
			downloadBlob(`${base}.png`, await res.blob());
			return;
		}
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

/** Export the current selection as a PNG download (§M1-11). */
export async function exportSelectionPng(engine: CanvasEngine): Promise<void> {
	const selected = engine.selectionManager.selected.map((id) => engine.store.get(id)).filter(Boolean) as CanvasObject[];
	if (selected.length === 0) return;
	try {
		const theme = themeController.resolved;
		const objects = await resolveAssetSources(selected);
		const getImage = createImageGetter();
		await preloadImages(objects, getImage);
		const dataUrl = await boardToPngDataUrl(objects, {
			scale: 2,
			theme,
			background: cssVar('--color-bg', theme === 'light' ? '#f5f5f7' : '#0f1013'),
			getImage
		});
		const res = await fetch(dataUrl);
		downloadBlob(`inkboard-selection-${Date.now()}.png`, await res.blob());
	} catch (err) {
		console.error('export selection failed', err);
	}
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

export async function importFile(
	ctx: TransferContext,
	mode: ImportMode = 'new',
	host?: Pick<TransferHost, 'onImportedBoard'>
): Promise<void> {
	// pick a file — Tauri native dialog if available, else hidden input
	let path: string | null = null;
	let file: File | null = null;
	if (isTauri()) {
		try {
			path = (await openDialog({
				multiple: false,
				filters: [{ name: 'Board files', extensions: ['inkboard', 'json', 'png', 'jpg', 'jpeg', 'webp', 'svg', 'zip'] }]
			})) as string | null;
		} catch {
			path = null;
		}
		if (!path) return;
	} else {
		file = await pickFileFallback();
		if (!file) return;
	}

	const world = { x: 0, y: 0 };

	if (path) {
		// Tauri path: Rust detects + parses everything
		try {
			const info = await invoke<{
				format: string;
				title?: string | null;
				texts?: string[];
				name?: string;
			}>('inspect_import', { path });
			if (info.format === 'inkboard') {
				// M2-06: Rust parses the archive and stores its assets (dedup)
				const imported = await invoke<{ boardJson: string }>('import_inkboard', { path });
				await finishBoardImport(ctx, imported.boardJson, mode, host);
				return;
			}
			if (info.format === 'json') {
				const bytes = await invoke<ArrayBuffer>('read_file_bytes', { path });
				await finishBoardImport(ctx, new TextDecoder().decode(bytes), mode, host);
				return;
			}
			if (info.format === 'image') {
				// image via Tauri path — raw bytes → Blob → data URL (B16)
				const dataUrl = await readFileAsDataUrl(path, info.name ?? 'image');
				ctx.engine.imageTool.insertImage(dataUrl, info.name ?? 'image', world.x, world.y);
			} else if (info.format === 'ms_whiteboard_zip') {
				insertImportedTexts(ctx.engine, info.title, info.texts ?? []);
			} else {
				console.warn('unsupported import format', info.format);
			}
		} catch (err) {
			console.error('import failed', err);
		}
	} else if (file) {
		if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
			// M2-07: internal JSON import works in the browser too
			await finishBoardImport(ctx, await file.text(), mode, host);
			return;
		}
		if (file.type.startsWith('image/')) {
			const reader = new FileReader();
			reader.onload = () => {
				ctx.engine.imageTool.insertImage(reader.result as string, file.name, world.x, world.y);
			};
			reader.readAsDataURL(file);
		} else {
			// legacy fallback: any other file imports as plain text lines
			const text = await file.text();
			insertImportedTexts(ctx.engine, null, text.split('\n').filter(Boolean));
		}
	}
	ctx.onDirty?.();
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

function sanitizeFilename(name: string): string {
	// strip path separators and Windows-reserved characters
	const clean = name
		.trim()
		.replace(/[<>:"/\\|?*]/g, '-')
		.split('')
		.filter((char) => char.charCodeAt(0) >= 32)
		.join('')
		.replace(/\s+/g, ' ');
	return clean || 'board';
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

function mimeForName(name: string): string {
	const lower = name.toLowerCase();
	if (lower.endsWith('.svg')) return 'image/svg+xml';
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
	if (lower.endsWith('.webp')) return 'image/webp';
	return 'image/png';
}

/** Raw bytes from the Rust side → Blob → data URL, no spread over the byte array (B16). */
async function readFileAsDataUrl(path: string, name: string): Promise<string> {
	const bytes = await invoke<ArrayBuffer>('read_file_bytes', { path });
	const blob = new Blob([bytes], { type: mimeForName(name) });
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}
