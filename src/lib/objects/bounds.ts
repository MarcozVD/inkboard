// Axis-aligned bounding box computation per object type (§14 — hit-testing candidates)
import type { Rect } from '$lib/utils/math';
import type { CanvasObject, ShapeObject, StrokeObject, ConnectorObject, Transform } from '$lib/objects/types';

export const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * World-space AABB of an object. Transform-based objects rotate around the
 * center of their box, so their bounds are the AABB of the rotated box (§M0-10).
 */
export function getObjectBounds(obj: CanvasObject): Rect {
	switch (obj.type) {
		case 'stroke':
			return strokeBounds(obj);
		case 'shape':
			return shapeBounds(obj);
		case 'connector':
			return connectorBounds(obj);
		case 'text':
		case 'image':
		case 'sticky_note':
		case 'group':
			// group bounds are derived from children by the store; fall back to transform
			return transformBounds(obj.transform);
	}
}

/** AABB of a (possibly rotated) box, rotation around the box center. */
export function transformBounds(t: Transform): Rect {
	const w = Math.abs(t.width);
	const h = Math.abs(t.height);
	const cx = t.x + t.width / 2;
	const cy = t.y + t.height / 2;
	const cos = Math.abs(Math.cos(t.rotation ?? 0));
	const sin = Math.abs(Math.sin(t.rotation ?? 0));
	const halfW = (w * cos + h * sin) / 2;
	const halfH = (w * sin + h * cos) / 2;
	return { x: cx - halfW, y: cy - halfH, width: halfW * 2, height: halfH * 2 };
}

function strokeBounds(s: StrokeObject): Rect {
	const pts = s.points;
	if (pts.length < 2) return EMPTY_RECT;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (let i = 0; i < pts.length; i += 3) {
		const x = pts[i];
		const y = pts[i + 1];
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	// inflate by stroke width so hit-testing near the line works
	const pad = s.style.width / 2;
	return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
}

function shapeBounds(s: ShapeObject): Rect {
	return transformBounds(s.transform);
}

function connectorBounds(c: ConnectorObject): Rect {
	const xs = [c.startPoint.x, c.endPoint.x, ...(c.waypoints ?? []).map((p) => p.x)];
	const ys = [c.startPoint.y, c.endPoint.y, ...(c.waypoints ?? []).map((p) => p.y)];
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const maxX = Math.max(...xs);
	const maxY = Math.max(...ys);
	const pad = c.style.strokeWidth;
	return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
}

/** Convert a Rect to world-space {minX,minY,maxX,maxY} for RBush */
export function rectToMinMax(r: Rect) {
	return { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height };
}
