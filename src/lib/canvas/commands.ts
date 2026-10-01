// Commands — delta-based operations over the ObjectStore (§15).
import { v4 as uuidv4 } from 'uuid';
import type { Command, HistoryManager } from './HistoryManager';
import type { ObjectStore } from './ObjectStore';
import type { CanvasObject, TextObject, StickyNoteObject, Transform } from '$lib/objects/types';
import { applyGeometry, type GeometrySnapshot } from '$lib/objects/geometry';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { ReorderMode } from '$lib/input/shortcuts';

function clone(obj: CanvasObject): CanvasObject {
	return structuredClone(obj);
}

/** Add a single object (or restore one that was removed). */
export class AddObjectCommand implements Command {
	readonly objectId: string;

	constructor(
		private store: ObjectStore,
		private obj: CanvasObject
	) {
		this.objectId = obj.id;
	}

	description = 'Add object';

	undo(): void {
		this.store.remove(this.obj.id);
	}

	redo(): void {
		this.store.add(clone(this.obj));
	}
}

/**
 * Drop the most recent undo entry if it is the Add command for `id`.
 * Used when an empty text/sticky is confirmed: the object and its creation
 * step must both disappear, so undo cannot resurrect an empty object.
 */
export function dropLastAddCommand(history: HistoryManager, id: string): boolean {
	// HistoryManager keeps its stacks private; reach them through the runtime shape.
	const stacks = history as unknown as { undoStack: Command[]; redoStack: Command[] };
	const last = stacks.undoStack[stacks.undoStack.length - 1];
	if (!(last instanceof AddObjectCommand) || last.objectId !== id) return false;
	stacks.undoStack.pop();
	// dropping the entry starts a fresh branch: pending redo is no longer valid
	stacks.redoStack.length = 0;
	return true;
}

// ── Selection actions (undoable) ──

/** Bring/send the current selection, registering one undo step (M0-08). */
export function reorderObjects(engine: CanvasEngine, mode: ReorderMode): boolean {
	const ids = engine.selectionManager.selected;
	if (ids.length === 0) return false;
	const store = engine.store;
	const before = new Map(store.getAll().map((o) => [o.id, o.zIndex ?? 0]));
	switch (mode) {
		case 'front':
			store.bringToFront(ids);
			break;
		case 'back':
			store.sendToBack(ids);
			break;
		case 'forward':
			store.moveForward(ids);
			break;
		case 'backward':
			store.moveBackward(ids);
			break;
	}
	const after = new Map(store.getAll().map((o) => [o.id, o.zIndex ?? 0]));
	const changed = [...after].some(([id, z]) => before.get(id) !== z);
	if (changed) engine.history.push(new ReorderCommand(store, before, after));
	return changed;
}

/** Delete objects (current selection by default) as one undo step. */
export function deleteObjects(engine: CanvasEngine, ids = engine.selectionManager.selected): void {
	const store = engine.store;
	const objs = ids.map((id) => store.get(id)).filter(Boolean) as CanvasObject[];
	if (objs.length === 0) return;
	const removedIds = objs.map((o) => o.id);
	store.removeMany(removedIds);
	engine.history.push({
		description: 'Delete',
		undo: () => store.addMany(objs.map((o) => structuredClone(o))),
		redo: () => store.removeMany(removedIds)
	});
	engine.selectionManager.clear();
}

/** Duplicate the current selection (offset +20/+20) as one undo step. */
export function duplicateObjects(engine: CanvasEngine): string[] {
	const store = engine.store;
	const clones: CanvasObject[] = [];
	for (const id of engine.selectionManager.selected) {
		const obj = store.get(id);
		if (!obj) continue;
		const clone = structuredClone(obj);
		clone.id = uuidv4();
		clone.transform.x += 20;
		clone.transform.y += 20;
		clone.createdAt = Date.now();
		clone.updatedAt = Date.now();
		clones.push(clone);
	}
	if (clones.length === 0) return [];
	store.addMany(clones);
	engine.selectionManager.selectMany(clones.map((c) => c.id));
	const ids = clones.map((c) => c.id);
	engine.history.push({
		description: 'Duplicate',
		undo: () => store.removeMany(ids),
		redo: () => store.addMany(clones.map((c) => structuredClone(c)))
	});
	return ids;
}

// ── In-canvas text editing (B03) ──

/** Fit the box to the committed content (single source of truth). */
export function fitContentBox(
	obj: TextObject | StickyNoteObject,
	content: string
): { width: number; height: number } {
	const lines = content.split('\n');
	const longest = Math.max(1, ...lines.map((l) => l.length));
	const pad = obj.style.padding ?? 4;
	const lh = obj.type === 'text' ? obj.style.lineHeight : 1.3;
	return {
		width: Math.max(40, longest * obj.style.fontSize * 0.6 + pad * 2),
		height: Math.max(30, lines.length * obj.style.fontSize * lh + pad * 2)
	};
}

function isEditableContent(obj: CanvasObject | undefined): obj is TextObject | StickyNoteObject {
	return !!obj && (obj.type === 'text' || obj.type === 'sticky_note');
}

/** Idempotent commit: writes to the real store object (§B03). */
export function commitTextContent(engine: CanvasEngine, id: string, content: string): void {
	const store = engine.store;
	const obj = store.get(id);
	if (!isEditableContent(obj)) return;

	if (content.trim() === '') {
		// empty confirm: delete the object; if it was just created, delete its
		// creation step from history too (otherwise undo would resurrect it)
		store.remove(id);
		if (!dropLastAddCommand(engine.history, id)) {
			engine.history.push(new RemoveObjectCommand(store, obj));
		}
		return;
	}

	const before = { content: obj.content, transform: { ...obj.transform } };
	if (before.content === content) return;

	const box = fitContentBox(obj, content);
	store.update(id, {
		content,
		transform: { ...obj.transform, width: box.width, height: box.height }
	} as Partial<CanvasObject>);
	engine.history.push(new UpdateContentCommand(store, id, before, { content, transform: { ...obj.transform } }));
}

/** Esc: abort the edit. A freshly created (still empty) object is discarded. */
export function cancelTextContent(engine: CanvasEngine, id: string): boolean {
	const obj = engine.store.get(id);
	if (isEditableContent(obj) && obj.content.trim() === '') {
		engine.store.remove(id);
		dropLastAddCommand(engine.history, id);
		return true;
	}
	return false;
}

/** Remove an object (or re-remove one that was restored). */
export class RemoveObjectCommand implements Command {
	constructor(
		private store: ObjectStore,
		private obj: CanvasObject
	) {}

	description = 'Remove object';

	undo(): void {
		this.store.add(clone(this.obj));
	}

	redo(): void {
		this.store.remove(this.obj.id);
	}
}

/** Change the geometry of multiple objects (move/resize/rotate).
 * Snapshots cover strokes/connectors points too, not only `transform` (B11). */
export class UpdateTransformCommand implements Command {
	constructor(
		private store: ObjectStore,
		private before: Map<string, GeometrySnapshot>,
		private after: Map<string, GeometrySnapshot>
	) {}

	description = 'Transform';

	undo(): void {
		this.apply(this.before);
	}

	redo(): void {
		this.apply(this.after);
	}

	private apply(map: Map<string, GeometrySnapshot>): void {
		const ids: string[] = [];
		for (const [id, snap] of map) {
			const obj = this.store.get(id);
			if (!obj) continue;
			applyGeometry(obj, snap);
			obj.updatedAt = Date.now();
			ids.push(id);
		}
		if (ids.length) this.store.notifyMoved(ids);
	}
}

/** Content snapshot for text-like objects (content + fitted box). */
export interface ContentSnapshot {
	content: string;
	transform: Transform;
}

type EditableObject = TextObject | StickyNoteObject;

/** Change the content (and the fitted box) of a text or sticky note. */
export class UpdateContentCommand implements Command {
	constructor(
		private store: ObjectStore,
		private id: string,
		private before: ContentSnapshot,
		private after: ContentSnapshot
	) {}

	description = 'Edit content';

	undo(): void {
		this.apply(this.before);
	}

	redo(): void {
		this.apply(this.after);
	}

	private apply(snapshot: ContentSnapshot): void {
		const obj = this.store.get(this.id) as EditableObject | undefined;
		if (!obj) return;
		obj.content = snapshot.content;
		obj.transform = { ...snapshot.transform };
		obj.updatedAt = Date.now();
		this.store.notifyMoved([this.id]);
	}
}

/** Change z-order of objects (bringToFront / sendToBack / reorder). */
export class ReorderCommand implements Command {
	constructor(
		private store: ObjectStore,
		private before: Map<string, number>,
		private after: Map<string, number>
	) {}

	description = 'Reorder';

	undo(): void {
		this.apply(this.before);
	}

	redo(): void {
		this.apply(this.after);
	}

	private apply(map: Map<string, number>): void {
		const ids: string[] = [];
		for (const [id, z] of map) {
			const obj = this.store.get(id);
			if (!obj) continue;
			obj.zIndex = z;
			ids.push(id);
		}
		if (ids.length) this.store.notifyChange(ids);
	}
}
