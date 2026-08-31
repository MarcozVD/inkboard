// TextTool — click on canvas creates an editable text object (§6).
// Double-clicking an existing text object (with SelectTool) also opens editing.
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { createText } from '$lib/objects/factory';
import type { TextObject } from '$lib/objects/types';
import { AddObjectCommand } from '$lib/canvas/commands';

export class TextTool extends BaseTool {
	/** Called when the tool created a text object that should open the editor. */
	onEditRequest: ((obj: TextObject) => void) | null = null;

	constructor(ctx: ToolContext) {
		super(ctx);
	}

	pointerDown(e: ToolPointerEvent): void {
		const c = this.ctx.camera();
		const wx = (e.screenX - c.x) / c.zoom;
		const wy = (e.screenY - c.y) / c.zoom;

		const obj = createText(wx, wy, '', {});
		this.ctx.store.add(obj);
		this.ctx.pushHistory?.(new AddObjectCommand(this.ctx.store, obj));
		this.ctx.onDirty();
		this.onEditRequest?.(obj);
	}

	pointerMove(_e: ToolPointerEvent): void {}

	pointerUp(_e: ToolPointerEvent): void {}
}
