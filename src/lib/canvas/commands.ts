// Commands — delta-based operations over the ObjectStore (§15).
import type { Command } from './HistoryManager';
import type { ObjectStore } from './ObjectStore';
import type { CanvasObject, Transform } from '$lib/objects/types';

function clone(obj: CanvasObject): CanvasObject {
	return structuredClone(obj);
}

/** Add a single object (or restore one that was removed). */
export class AddObjectCommand implements Command {
	constructor(
		private store: ObjectStore,
		private obj: CanvasObject
	) {}

	description = 'Add object';

	undo(): void {
		this.store.remove(this.obj.id);
	}

	redo(): void {
		this.store.add(clone(this.obj));
	}
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
