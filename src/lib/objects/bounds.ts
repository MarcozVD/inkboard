// Axis-aligned bounding box computation per object type (§14 — hit-testing candidates)
import type { Rect } from '$lib/utils/math';
import type { CanvasObject, ShapeObject, StrokeObject, ConnectorObject } from '$lib/objects/types';

export const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** World-space AABB of an object, ignoring rotation (conservative candidates for culling/hit-test). */
export function getObjectBounds(obj: CanvasObject): Rect {
	switch (obj.type) {
		case 'stroke':
			return strokeBounds(obj);
		case 'shape':
			return shapeBounds(obj);
		case 'connector':
			return connectorBounds(obj);
		case 'text':
			return { x: obj.transform.x, y: obj.transform.y, width: obj.transform.width, height: obj.transform.height };
		case 'image':
			return { x: obj.transform.x, y: obj.transform.y, width: obj.transform.width, height: obj.transform.height };
		case 'sticky_note':
			return { x: obj.transform.x, y: obj.transform.y, width: obj.transform.width, height: obj.transform.height };
		case 'group':
			// group bounds are derived from children by the store; fall back to transform
			return { x: obj.transform.x, y: obj.transform.y, width: obj.transform.width, height: obj.transform.height };
	}
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
	const t = s.transform;
	switch (s.shape) {
		case 'line':
		case 'arrow': {
			const x = Math.min(t.x, t.x + t.width);
			const y = Math.min(t.y, t.y + t.height);
			return { x, y, width: Math.abs(t.width), height: Math.abs(t.height) };
		}
		default:
			return { x: t.x, y: t.y, width: Math.abs(t.width), height: Math.abs(t.height) };
	}
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
