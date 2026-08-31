// 2D math helpers for the whiteboard engine

export interface Vec2 {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function vec2(x: number, y: number): Vec2 {
	return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
	return { x: v.x * s, y: v.y * s };
}

export function distance(a: Vec2, b: Vec2): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
}

export function rectContains(r: Rect, p: Vec2): boolean {
	return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** Point in axis-aligned rect given as {x,y,width,height} with optional padding */
export function pointInRect(p: Vec2, r: Rect, pad = 0): boolean {
	return p.x >= r.x - pad && p.x <= r.x + r.width + pad && p.y >= r.y - pad && p.y <= r.y + r.height + pad;
}

/** Point in ellipse centered at rect center with radius = half extents */
export function pointInEllipse(p: Vec2, r: Rect): boolean {
	const cx = r.x + r.width / 2;
	const cy = r.y + r.height / 2;
	const rx = r.width / 2;
	const ry = r.height / 2;
	if (rx <= 0 || ry <= 0) return false;
	const dx = (p.x - cx) / rx;
	const dy = (p.y - cy) / ry;
	return dx * dx + dy * dy <= 1;
}

/** Shortest squared distance from point p to segment ab */
export function distSqToSegment(p: Vec2, a: Vec2, b: Vec2): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
	let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	const projX = a.x + t * dx;
	const projY = a.y + t * dy;
	return (p.x - projX) ** 2 + (p.y - projY) ** 2;
}

/**
 * Transform a world-space point into an object's local space (undo translate,
 * rotate, scale). Useful for rotated hit-testing.
 */
export function worldToLocal(p: Vec2, t: { x: number; y: number; rotation?: number; scaleX?: number; scaleY?: number }): Vec2 {
	const cos = Math.cos(-(t.rotation ?? 0));
	const sin = Math.sin(-(t.rotation ?? 0));
	const dx = p.x - t.x;
	const dy = p.y - t.y;
	const rx = dx * cos - dy * sin;
	const ry = dx * sin + dy * cos;
	return {
		x: rx / (t.scaleX ?? 1),
		y: ry / (t.scaleY ?? 1)
	};
}

export function rectIntersects(a: Rect, b: Rect): boolean {
	return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

/** Convert a Rect to RBush-style { minX, minY, maxX, maxY } */
export function toBBox(r: Rect) {
	return { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height };
}