// Commands — delta-based operations over the ObjectStore (§15).
import type { Command, HistoryManager } from './HistoryManager';
import type { ObjectStore } from './ObjectStore';
import type { CanvasObject, TextObject, StickyNoteObject, Transform } from '$lib/objects/types';

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

/** Change transforms of multiple objects (move/resize/rotate). Deltas via before/after maps. */
export class UpdateTransformCommand implements Command {
	constructor(
		private store: ObjectStore,
		private before: Map<string, Transform>,
		private after: Map<string, Transform>
	) {}

	description = 'Transform';

	undo(): void {
		this.apply(this.before);
	}

	redo(): void {
		this.apply(this.after);
	}

	private apply(map: Map<string, Transform>): void {
		const ids: string[] = [];
		for (const [id, t] of map) {
			const obj = this.store.get(id);
			if (!obj) continue;
			obj.transform = { ...t };
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
