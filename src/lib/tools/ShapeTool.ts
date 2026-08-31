// ShapeTool — drag from corner to corner to create a shape (§7).
// Shift keeps the aspect ratio (proportional).
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { createShape } from '$lib/objects/factory';
import type { ShapeType, ShapeStyle } from '$lib/objects/types';

export interface ShapeConfig {
	shape: ShapeType;
	style: Partial<ShapeStyle>;
}

export const DEFAULT_SHAPE_CONFIG: ShapeConfig = {
	shape: 'rect',
	style: { fill: 'none', stroke: '#e8e9ec', strokeWidth: 2 }
};

export const SHAPE_TYPES: ShapeType[] = ['rect', 'ellipse', 'line', 'arrow', 'triangle', 'diamond', 'star', 'polygon'];

export class ShapeTool extends BaseTool {
	config: ShapeConfig = structuredClone(DEFAULT_SHAPE_CONFIG);
	private start: { x: number; y: number } | null = null;
	private draft: string | null = null; // id of the in-progress shape

	pointerDown(e: ToolPointerEvent): void {
		const c = this.ctx.camera();
		this.start = { x: (e.screenX - c.x) / c.zoom, y: (e.screenY - c.y) / c.zoom };
		// seed a zero-size shape so the user sees the draft live
		const obj = createShape(this.start.x, this.start.y, 0.01, 0.01, this.config.shape, this.config.style);
		this.ctx.store.add(obj);
		this.draft = obj.id;
		this.ctx.onDirty();
	}

	pointerMove(e: ToolPointerEvent): void {
		if (!this.start || !this.draft) return;
		const c = this.ctx.camera();
		const wx = (e.screenX - c.x) / c.zoom;
		const wy = (e.screenY - c.y) / c.zoom;

		let width = wx - this.start.x;
		let height = wy - this.start.y;

		// proportional (Shift): base on the larger delta, keep the anchor corner
		if (e.shift) {
			const absW = Math.abs(width);
			const absH = Math.abs(height);
			const signX = Math.sign(width) || 1;
			const signY = Math.sign(height) || 1;
			const m = Math.max(absW, absH);
			width = signX * m;
			height = signY * m;
		}

		const obj = this.ctx.store.get(this.draft);
		if (!obj) return;
		// normalize negative drags (top-left anchor)
		obj.transform.x = width >= 0 ? this.start.x : this.start.x + width;
		obj.transform.y = height >= 0 ? this.start.y : this.start.y + height;
		obj.transform.width = Math.max(Math.abs(width), 1);
		obj.transform.height = Math.max(Math.abs(height), 1);
		obj.updatedAt = Date.now();
		this.ctx.store.notifyMoved([this.draft]);
		this.ctx.onDirty();
	}

	pointerUp(_e: ToolPointerEvent): void {
		if (!this.draft) return;
		const obj = this.ctx.store.get(this.draft);
		if (obj && obj.transform.width < 4 && obj.transform.height < 4) {
			// accidental click — discard the tiny shape
			this.ctx.store.remove(this.draft);
		}
		this.ctx.onGestureEnd?.();
		this.ctx.onDirty();
		this.start = null;
		this.draft = null;
	}

	reset(): void {
		this.start = null;
		this.draft = null;
	}
}
