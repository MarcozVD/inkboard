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

export function rectIntersects(a: Rect, b: Rect): boolean {
	return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

/** Convert a Rect to RBush-style { minX, minY, maxX, maxY } */
export function toBBox(r: Rect) {
	return { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height };
}