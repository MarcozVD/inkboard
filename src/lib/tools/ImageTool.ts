// ImageTool — insert images via file picker, paste, or drag & drop (§8)
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { createImage } from '$lib/objects/factory';
import type { CanvasObject } from '$lib/objects/types';
import { AddObjectsCommand } from '$lib/canvas/commands';

export class ImageTool extends BaseTool {
	private hiddenInput: HTMLInputElement | null = null;

	constructor(ctx: ToolContext) {
		super(ctx);
		this.setupFileInput();
	}

	private setupFileInput() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
		input.style.display = 'none';
		input.multiple = false;
		input.onchange = () => {
			const file = input.files?.[0];
			if (file) this.loadFile(file);
			input.value = '';
		};
		document.body.appendChild(input);
		this.hiddenInput = input;
	}

	pointerDown(e: ToolPointerEvent): void {
		const c = this.ctx.camera();
		if (!this.hiddenInput) return;
		// store the click position for where to place the image
		this.clickWorld = { x: (e.screenX - c.x) / c.zoom, y: (e.screenY - c.y) / c.zoom };
		this.hiddenInput.click();
	}

	private clickWorld: { x: number; y: number } = { x: 0, y: 0 };

	/** Add the image as a single undo step (B13) through the mutation API. */
	private commit(obj: CanvasObject): void {
		this.ctx.execute(new AddObjectsCommand(this.ctx.store, [obj]));
		this.ctx.onDirty();
	}

	private loadFile(file: File) {
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const img = new Image();
			img.onload = () => {
				this.commit(
					createImage(
						this.clickWorld.x - img.width / 2 / 2,
						this.clickWorld.y - img.height / 2 / 2,
						dataUrl,
						img.width,
						img.height
					)
				);
			};
			img.onerror = () => {
				// fallback: use conservative dimensions
				this.commit(createImage(this.clickWorld.x - 200, this.clickWorld.y - 150, dataUrl, 400, 300));
			};
			img.src = dataUrl;
		};
		reader.readAsDataURL(file);
	}

	/** Insert a pasted / dragged image from a data URL at the given world position. */
	insertImage(dataUrl: string, _name: string, wx: number, wy: number): void {
		const img = new Image();
		img.onload = () => {
			const w = img.width;
			const h = img.height;
			this.commit(createImage(wx - w / 2 / 2, wy - h / 2 / 2, dataUrl, w, h));
		};
		img.onerror = () => {
			this.commit(createImage(wx - 200, wy - 150, dataUrl, 400, 300));
		};
		img.src = dataUrl;
	}

	pointerMove(_e: ToolPointerEvent): void {}
	pointerUp(_e: ToolPointerEvent): void {}
}