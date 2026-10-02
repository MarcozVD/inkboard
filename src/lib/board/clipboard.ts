// clipboard — object clipboard (RF-09, §M1-04).
// System clipboard uses a versioned text format with a marker; a module-level
// fallback keeps copy/paste working without clipboard permissions and across boards.
import { v4 as uuidv4 } from 'uuid';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { CameraState } from '$lib/canvas/Camera';
import type { CanvasObject } from '$lib/objects/types';
import { AddObjectsCommand, RemoveObjectsCommand } from '$lib/canvas/commands';
import { translateObject } from '$lib/objects/geometry';
import { getObjectBounds } from '$lib/objects/bounds';
import { createText } from '$lib/objects/factory';
import { assetifyImages, resolveAssetSources } from '$lib/io/assets';
import type { Vec2 } from '$lib/utils/math';

export const CLIPBOARD_MARKER = 'inkboard/clipboard@1';
const CLIPBOARD_VERSION = 1;
const PASTE_OFFSET = 20;

// Shared across board instances (paste between boards, repeated-paste offset).
let fallbackPayload: string | null = null;
let pasteCount = 0;

/** Serialize objects to the versioned clipboard text payload. */
export function serializeClipboard(objects: CanvasObject[]): string {
	return `${CLIPBOARD_MARKER}\n${JSON.stringify({ version: CLIPBOARD_VERSION, objects })}`;
}

/** Parse a clipboard text payload; null when it is not ours (marker/version/JSON). */
export function parseClipboard(text: string): CanvasObject[] | null {
	if (!text.startsWith(CLIPBOARD_MARKER)) return null;
	const json = text.slice(CLIPBOARD_MARKER.length).trim();
	try {
		const data = JSON.parse(json) as { version?: number; objects?: unknown };
		if (data?.version !== CLIPBOARD_VERSION || !Array.isArray(data.objects)) return null;
		return data.objects as CanvasObject[];
	} catch {
		return null;
	}
}

/** Fresh ids for a pasted batch, remapping group and connector references. */
export function remapClipboardObjects(objects: CanvasObject[]): CanvasObject[] {
	const idMap = new Map<string, string>();
	for (const obj of objects) idMap.set(obj.id, uuidv4());
	const now = Date.now();
	return objects.map((obj) => {
		const clone = structuredClone(obj);
		clone.id = idMap.get(obj.id)!;
		clone.createdAt = now;
		clone.updatedAt = now;
		if (clone.groupId) clone.groupId = idMap.get(clone.groupId) ?? clone.groupId;
		if (clone.type === 'connector') {
			if (clone.startObjectId) clone.startObjectId = idMap.get(clone.startObjectId) ?? clone.startObjectId;
			if (clone.endObjectId) clone.endObjectId = idMap.get(clone.endObjectId) ?? clone.endObjectId;
		}
		if (clone.type === 'group') {
			clone.childIds = clone.childIds.map((id) => idMap.get(id) ?? id);
		}
		return clone;
	});
}

function unionBounds(objects: CanvasObject[]): { x: number; y: number; width: number; height: number } {
	let union: { x: number; y: number; width: number; height: number } | null = null;
	for (const obj of objects) {
		const b = getObjectBounds(obj);
		union = union
			? {
					x: Math.min(union.x, b.x),
					y: Math.min(union.y, b.y),
					width: Math.max(union.x + union.width, b.x + b.width) - Math.min(union.x, b.x),
					height: Math.max(union.y + union.height, b.y + b.height) - Math.min(union.y, b.y)
				}
			: { ...b };
	}
	return union ?? { x: 0, y: 0, width: 0, height: 0 };
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

export interface ClipboardDeps {
	getEngine: () => CanvasEngine | null;
	getCamera: () => CameraState;
	getView: () => { width: number; height: number };
	/** last pointer position in canvas-local CSS px */
	getCursor: () => Vec2 | null;
	onDirty: () => void;
}

export function createClipboard(deps: ClipboardDeps) {
	function targetWorld(explicit?: Vec2 | null): Vec2 {
		const camera = deps.getCamera();
		if (explicit) return explicit;
		const view = deps.getView();
		const p = deps.getCursor() ?? { x: view.width / 2, y: view.height / 2 };
		return { x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom };
	}

	/**
	 * Copy the current selection; returns the serialized payload.
	 * M2-05: asset refs are inlined as data URLs so the clipboard is portable.
	 */
	async function copySelection(): Promise<string | null> {
		const engine = deps.getEngine();
		if (!engine) return null;
		const selected = engine.selectionManager.selected
			.map((id) => engine.store.get(id))
			.filter(Boolean) as CanvasObject[];
		if (selected.length === 0) return null;
		const objects = await resolveAssetSources(selected);
		const payload = serializeClipboard(objects);
		fallbackPayload = payload;
		pasteCount = 0;
		try {
			void navigator.clipboard?.writeText(payload);
		} catch {
			// clipboard unavailable — the internal fallback still works
		}
		return payload;
	}

	/** Cut: copy + remove as one undo step. */
	async function cutSelection(): Promise<void> {
		const engine = deps.getEngine();
		if (!engine) return;
		const ids = [...engine.selectionManager.selected];
		if (!(await copySelection())) return;
		const objects = ids.map((id) => engine.store.get(id)).filter(Boolean) as CanvasObject[];
		engine.execute(new RemoveObjectsCommand(engine.store, objects));
		engine.selectionManager.clear();
		deps.onDirty();
	}

	async function insertObjects(source: CanvasObject[], target: Vec2): Promise<void> {
		const engine = deps.getEngine();
		if (!engine) return;
		const clones = remapClipboardObjects(source);
		// M2-05: images pasted as data URLs go back into the asset store
		await assetifyImages(clones);
		const bounds = unionBounds(clones);
		const step = PASTE_OFFSET * pasteCount;
		const dx = target.x - (bounds.x + bounds.width / 2) + step;
		const dy = target.y - (bounds.y + bounds.height / 2) + step;
		for (const obj of clones) translateObject(obj, dx, dy);
		engine.execute(new AddObjectsCommand(engine.store, clones));
		engine.selectionManager.selectMany(clones.map((o) => o.id));
		pasteCount++;
		deps.onDirty();
	}

	function pasteText(content: string, target: Vec2): void {
		const engine = deps.getEngine();
		if (!engine) return;
		const obj = createText(target.x, target.y, content);
		engine.execute(new AddObjectsCommand(engine.store, [obj]));
		engine.selectionManager.selectMany([obj.id]);
		deps.onDirty();
	}

	async function paste(at?: Vec2 | null): Promise<void> {
		const target = targetWorld(at);
		let text: string | null = null;
		try {
			text = (await navigator.clipboard?.readText()) ?? null;
		} catch {
			// clipboard unavailable — the internal fallback below still works
		}
		const parsed = text ? parseClipboard(text) : null;
		if (parsed) {
			await insertObjects(parsed, target);
			return;
		}

		const image = await readSystemImage();
		if (image) {
			deps.getEngine()?.imageTool.insertImage(image, 'pasted image', target.x, target.y);
			return;
		}

		if (text && text.trim()) {
			pasteText(text, target);
			return;
		}

		if (fallbackPayload) {
			const fallback = parseClipboard(fallbackPayload);
			if (fallback) await insertObjects(fallback, target);
		}
	}

	/** Native `paste` event: images, our payload, or plain text. */
	function pasteFromEvent(e: ClipboardEvent): void {
		const target = targetWorld(null);
		const items = e.clipboardData?.items;
		if (items) {
			for (const item of items) {
				if (!item.type.startsWith('image/')) continue;
				const file = item.getAsFile();
				if (!file) continue;
				e.preventDefault();
				const reader = new FileReader();
				reader.onload = () => {
					deps.getEngine()?.imageTool.insertImage(reader.result as string, file.name, target.x, target.y);
				};
				reader.readAsDataURL(file);
				return;
			}
		}
		const text = e.clipboardData?.getData('text/plain') ?? '';
		const parsed = text ? parseClipboard(text) : null;
		if (parsed) {
			e.preventDefault();
			void insertObjects(parsed, target);
			return;
		}
		if (text.trim()) {
			e.preventDefault();
			pasteText(text, target);
		}
	}

	async function readSystemImage(): Promise<string | null> {
		try {
			const items = await navigator.clipboard?.read();
			if (!items) return null;
			for (const item of items) {
				const imageType = item.types.find((type) => type.startsWith('image/'));
				if (!imageType) continue;
				return await blobToDataUrl(await item.getType(imageType));
			}
		} catch {
			return null;
		}
		return null;
	}

	return { copySelection, cutSelection, paste, pasteFromEvent };
}
