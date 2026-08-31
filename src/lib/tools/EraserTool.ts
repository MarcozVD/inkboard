// EraserTool — object-based erasure (§5). Click/drag over objects → remove.
// Removals in one drag become a single undo step (composite command).
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { SelectionManager } from '$lib/canvas/SelectionManager';
import type { CanvasObject } from '$lib/objects/types';

export class EraserTool extends BaseTool {
	private sel = new SelectionManager(this.ctx.store);
	private erasing = false;
	private removed: CanvasObject[] = [];

	pointerDown(e: ToolPointerEvent): void {
		const world = this.screenToWorld(e.screenX, e.screenY);
		const hit = this.sel.hitTest(world);
		if (hit) {
			this.ctx.store.remove(hit.id);
			this.removed.push(hit);
			this.ctx.onDirty();
		}
		this.erasing = true;
	}

	pointerMove(e: ToolPointerEvent): void {
		if (!this.erasing) return;
		const world = this.screenToWorld(e.screenX, e.screenY);
		const hit = this.sel.hitTest(world);
		if (hit) {
			this.ctx.store.remove(hit.id);
			this.removed.push(hit);
			this.ctx.onDirty();
		}
	}

	pointerUp(_e: ToolPointerEvent): void {
		if (this.removed.length > 0) {
			// composite: one command restoring all erased objects
			const first = this.removed[0];
			const store = this.ctx.store;
			this.ctx.pushHistory?.({
				description: 'Erase',
				undo: () => store.addMany(this.removed.map((o) => structuredClone(o))),
				redo: () => this.removed.forEach((o) => store.remove(o.id))
			});
			void first;
		}
		this.erasing = false;
		this.removed = [];
	}

	private screenToWorld(sx: number, sy: number) {
		const c = this.ctx.camera();
		return { x: (sx - c.x) / c.zoom, y: (sy - c.y) / c.zoom };
	}
}
