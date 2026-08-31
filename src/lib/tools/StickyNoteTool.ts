// StickyNoteTool — click creates a sticky note with a preset color (§9)
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { createStickyNote } from '$lib/objects/factory';
import type { StickyNoteObject } from '$lib/objects/types';
import { stickyNoteColors } from '$lib/objects/renderers';

export class StickyNoteTool extends BaseTool {
	/** Called when the tool created a note that should open the editor. */
	onEditRequest: ((obj: StickyNoteObject) => void) | null = null;

	/** Current color index into stickyNoteColors() */
	colorIndex = 0;

	constructor(ctx: ToolContext) {
		super(ctx);
	}

	get colors(): string[] {
		return stickyNoteColors();
	}

	get currentColor(): string {
		return this.colors[this.colorIndex % this.colors.length];
	}

	setColor(index: number): void {
		this.colorIndex = index;
	}

	pointerDown(e: ToolPointerEvent): void {
		const c = this.ctx.camera();
		const wx = (e.screenX - c.x) / c.zoom;
		const wy = (e.screenY - c.y) / c.zoom;

		const obj = createStickyNote(wx, wy, '', { backgroundColor: this.currentColor });
		this.ctx.store.add(obj);
		this.ctx.onDirty();
		this.onEditRequest?.(obj);
	}

	pointerMove(_e: ToolPointerEvent): void {}
	pointerUp(_e: ToolPointerEvent): void {}
}
