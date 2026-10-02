// ImageTool — insert images via file picker, paste, or drag & drop (§8)
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { createImage } from '$lib/objects/factory';
import type { CanvasObject } from '$lib/objects/types';
import { AddObjectsCommand } from '$lib/canvas/commands';
import { ASSET_PREFIX, parseDataUrl, putAsset } from '$lib/io/assets';

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

	/** Store the inline bytes as a content-addressed asset (M2-05). */
	private async toAssetSrc(dataUrl: string, width: number, height: number): Promise<string> {
		if (!dataUrl.startsWith('data:')) return dataUrl;
		const parsed = parseDataUrl(dataUrl);
		if (!parsed) return dataUrl;
		try {
			return `${ASSET_PREFIX}${await putAsset(parsed.bytes, parsed.mime, width, height)}`;
		} catch (err) {
			console.error('asset store failed; keeping the data URL', err);
			return dataUrl;
		}
	}

	private loadFile(file: File) {
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const img = new Image();
			img.onload = () => {
				void this.toAssetSrc(dataUrl, img.width, img.height).then((src) =>
					this.commit(
						createImage(
							this.clickWorld.x - img.width / 2 / 2,
							this.clickWorld.y - img.height / 2 / 2,
							src,
							img.width,
							img.height
						)
					)
				);
			};
			img.onerror = () => {
				// fallback: use conservative dimensions
				void this.toAssetSrc(dataUrl, 400, 300).then((src) =>
					this.commit(createImage(this.clickWorld.x - 200, this.clickWorld.y - 150, src, 400, 300))
				);
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
			void this.toAssetSrc(dataUrl, w, h).then((src) =>
				this.commit(createImage(wx - w / 2 / 2, wy - h / 2 / 2, src, w, h))
			);
		};
		img.onerror = () => {
			void this.toAssetSrc(dataUrl, 400, 300).then((src) =>
				this.commit(createImage(wx - 200, wy - 150, src, 400, 300))
			);
		};
		img.src = dataUrl;
	}

	pointerMove(_e: ToolPointerEvent): void {}
	pointerUp(_e: ToolPointerEvent): void {}
}
