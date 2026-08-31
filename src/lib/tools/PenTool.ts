// PenTool — freehand drawing with pressure + perfect-freehand smoothing (§5)
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { createStroke } from '$lib/objects/factory';
import type { StrokeObject } from '$lib/objects/types';
import { v4 as uuidv4 } from 'uuid';

export interface PenConfig {
	color: string;
	width: number;
	isHighlighter: boolean;
	opacity?: number;
}

export const DEFAULT_PEN_CONFIG: PenConfig = { color: '#e8e9ec', width: 3, isHighlighter: false };

export class PenTool extends BaseTool {
	protected active: StrokeObject | null = null;
	private minDistSq = 1.5 * 1.5; // skip points closer than 1.5px
	private lastPoint: { x: number; y: number } | null = null;

	config: PenConfig = { ...DEFAULT_PEN_CONFIG };

	constructor(ctx: ToolContext) {
		super(ctx);
	}

	protected screenToWorld(sx: number, sy: number) {
		const c = this.ctx.camera();
		return { x: (sx - c.x) / c.zoom, y: (sy - c.y) / c.zoom };
	}

	pointerDown(e: ToolPointerEvent): void {
		const p = this.screenToWorld(e.screenX, e.screenY);
		const pressure = this.normalizedPressure(e.pressure);
		this.lastPoint = p;
		const points = [p.x, p.y, pressure];
		const stroke = createStroke(points, {
			color: this.config.color,
			width: this.config.width,
			isHighlighter: this.config.isHighlighter,
			opacity: this.config.opacity ?? 1
		});
		this.active = stroke;
		this.ctx.store.add(stroke);
		this.ctx.onDirty();
	}

	pointerMove(e: ToolPointerEvent): void {
		if (!this.active) return;
		const p = this.screenToWorld(e.screenX, e.screenY);
		if (this.lastPoint) {
			const dx = p.x - this.lastPoint.x;
			const dy = p.y - this.lastPoint.y;
			if (dx * dx + dy * dy < this.minDistSq) return;
		}
		const pressure = this.normalizedPressure(e.pressure);
		this.active.points.push(p.x, p.y, pressure);
		this.lastPoint = p;
		// single-object spatial re-sync (cheap: remove+insert)
		this.ctx.store.notifyMoved([this.active.id]);
		this.ctx.onDirty();
	}

	pointerUp(_e: ToolPointerEvent): void {
		if (!this.active) return;
		// simplify only if large enough (keeps fidelity for short strokes)
		if (this.active.points.length > 90) {
			this.active.points = simplifyStroke(this.active.points, 0.5);
		}
		this.ctx.store.notifyMoved([this.active.id]);
		this.ctx.onGestureEnd?.();
		this.ctx.onDirty();
		this.active = null;
		this.lastPoint = null;
	}

	reset(): void {
		this.active = null;
		this.lastPoint = null;
	}

	private normalizedPressure(p: number): number {
		// mouse reports 0 or 0.5; stylus reports 0..1
		if (p === 0) return 0.5;
		return Math.min(1, Math.max(0.05, p));
	}
}

/**
 * Ramer-Douglas-Peucker simplification on flattened [x,y,p] arrays.
 * Keeps stroke quality while cutting point count for long strokes (§5).
 */
export function simplifyStroke(points: number[], epsilon = 0.5): number[] {
	if (points.length < 6) return points;
	const idx = rdp(points, 0, points.length / 3 - 1, epsilon);
	const out: number[] = [];
	for (const i of idx) out.push(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
	return out;
}

function rdp(points: number[], first: number, last: number, epsilon: number): number[] {
	if (last - first < 1) return [first];
	let maxDist = 0;
	let index = first;
	const startX = points[first * 3];
	const startY = points[first * 3 + 1];
	const endX = points[last * 3];
	const endY = points[last * 3 + 1];
	for (let i = first + 1; i < last; i++) {
		const dist = perpendicularDist(points[i * 3], points[i * 3 + 1], startX, startY, endX, endY);
		if (dist > maxDist) {
			maxDist = dist;
			index = i;
		}
	}
	if (maxDist > epsilon) {
		const left = rdp(points, first, index, epsilon);
		const right = rdp(points, index, last, epsilon);
		return [...left.slice(0, -1), ...right];
	}
	return [first, last];
}

function perpendicularDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(px - ax, py - ay);
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
