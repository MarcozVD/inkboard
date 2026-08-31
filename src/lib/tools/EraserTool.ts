// EraserTool — object-based erasure (§5). Click/drag over objects → remove.
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { SelectionManager } from '$lib/canvas/SelectionManager';

export class EraserTool extends BaseTool {
	private sel = new SelectionManager(this.ctx.store);
	private erasing = false;

	pointerDown(e: ToolPointerEvent): void {
		const world = this.screenToWorld(e.screenX, e.screenY);
		const hit = this.sel.hitTest(world);
		if (hit) {
			this.ctx.store.remove(hit.id);
			this.ctx.onDirty();
		}
		// drag to erase multiple
		this.erasing = true;
	}

	pointerMove(e: ToolPointerEvent): void {
		if (!this.erasing) return;
		const world = this.screenToWorld(e.screenX, e.screenY);
		const hit = this.sel.hitTest(world);
		if (hit) {
			this.ctx.store.remove(hit.id);
			this.ctx.onDirty();
		}
	}

	pointerUp(_e: ToolPointerEvent): void {
		this.erasing = false;
	}

	private screenToWorld(sx: number, sy: number) {
		const c = this.ctx.camera();
		return { x: (sx - c.x) / c.zoom, y: (sy - c.y) / c.zoom };
	}
}