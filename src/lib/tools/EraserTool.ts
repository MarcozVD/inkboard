// EraserTool — object-based erasure (§5). Click/drag over objects → remove.
// Removals in one drag become a single undo step (composite command).
import { BaseTool, type ToolPointerEvent } from './BaseTool';
import { SelectionManager } from '$lib/canvas/SelectionManager';
import type { CanvasObject } from '$lib/objects/types';
import { RemoveObjectsCommand } from '$lib/canvas/commands';

export class EraserTool extends BaseTool {
	private sel = new SelectionManager(this.ctx.store);
	private erasing = false;
	/** one command collects every object erased during this gesture */
	private command: RemoveObjectsCommand | null = null;

	pointerDown(e: ToolPointerEvent): void {
		const world = this.screenToWorld(e.screenX, e.screenY);
		const hit = this.sel.hitTest(world);
		if (hit && !hit.locked) this.erase(hit);
		this.erasing = true;
	}

	pointerMove(e: ToolPointerEvent): void {
		if (!this.erasing) return;
		const world = this.screenToWorld(e.screenX, e.screenY);
		const hit = this.sel.hitTest(world);
		if (hit && !hit.locked) this.erase(hit);
	}

	pointerUp(_e: ToolPointerEvent): void {
		this.erasing = false;
		this.command = null;
	}

	private erase(obj: CanvasObject): void {
		if (!this.command) {
			this.command = new RemoveObjectsCommand(this.ctx.store, [obj]);
			this.ctx.execute(this.command);
		} else {
			this.command.removeNow(obj);
		}
		this.ctx.onDirty();
	}

	private screenToWorld(sx: number, sy: number) {
		const c = this.ctx.camera();
		return { x: (sx - c.x) / c.zoom, y: (sy - c.y) / c.zoom };
	}
}
