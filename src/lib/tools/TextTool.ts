// TextTool — click on canvas creates an editable text object (§6).
// Double-clicking an existing text object (with SelectTool) also opens editing.
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { createText } from '$lib/objects/factory';
import type { TextObject, TextStyle } from '$lib/objects/types';
import { AddObjectsCommand } from '$lib/canvas/commands';
import { INK } from '$lib/objects/colors';

/** Last-used text style (M1-03): new objects are created with it. */
export interface TextToolConfig {
	fontSize: number;
	fontWeight: TextStyle['fontWeight'];
	fontStyle: TextStyle['fontStyle'];
	textAlign: TextStyle['textAlign'];
	color: string;
}

export const DEFAULT_TEXT_CONFIG: TextToolConfig = {
	fontSize: 24,
	fontWeight: 'normal',
	fontStyle: 'normal',
	textAlign: 'left',
	color: INK
};

export class TextTool extends BaseTool {
	/** Called when the tool created a text object that should open the editor. */
	onEditRequest: ((obj: TextObject) => void) | null = null;

	config: TextToolConfig = { ...DEFAULT_TEXT_CONFIG };

	constructor(ctx: ToolContext) {
		super(ctx);
	}

	pointerDown(e: ToolPointerEvent): void {
		const c = this.ctx.camera();
		const wx = (e.screenX - c.x) / c.zoom;
		const wy = (e.screenY - c.y) / c.zoom;

		const obj = createText(wx, wy, '', { ...this.config });
		this.ctx.execute(new AddObjectsCommand(this.ctx.store, [obj]));
		this.ctx.onDirty();
		this.onEditRequest?.(obj);
	}

	pointerMove(_e: ToolPointerEvent): void {}

	pointerUp(_e: ToolPointerEvent): void {}
}
