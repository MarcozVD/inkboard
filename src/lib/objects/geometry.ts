// Geometry helpers — object-aware move/scale/rotate (§M0-10, fixes B11/B12).
// Strokes and connectors live in world-space points; everything else lives in
// `transform`. Rotation convention: around the CENTER of the object's box.
import type { CanvasObject, Transform } from '$lib/objects/types';
import type { Vec2 } from '$lib/utils/math';

/** Mutable geometry of an object, enough to restore its placement exactly. */
export interface GeometrySnapshot {
	transform: Transform;
	points?: number[];
	startPoint?: Vec2;
	endPoint?: Vec2;
	waypoints?: Vec2[];
}

/** Capture the geometry of an object (undo/redo + gesture start). */
export function captureGeometry(obj: CanvasObject): GeometrySnapshot {
	const snap: GeometrySnapshot = { transform: { ...obj.transform } };
	if (obj.type === 'stroke') {
		snap.points = [...obj.points];
	} else if (obj.type === 'connector') {
		snap.startPoint = { ...obj.startPoint };
		snap.endPoint = { ...obj.endPoint };
		if (obj.waypoints) snap.waypoints = obj.waypoints.map((p) => ({ ...p }));
	}
	return snap;
}

/** Restore a geometry snapshot onto an object. */
export function applyGeometry(obj: CanvasObject, snap: GeometrySnapshot): void {
	obj.transform = { ...snap.transform };
	if (obj.type === 'stroke' && snap.points) {
		obj.points = [...snap.points];
	} else if (obj.type === 'connector') {
		if (snap.startPoint) obj.startPoint = { ...snap.startPoint };
		if (snap.endPoint) obj.endPoint = { ...snap.endPoint };
		if (snap.waypoints) obj.waypoints = snap.waypoints.map((p) => ({ ...p }));
	}
}

export function boxCenter(t: Transform): Vec2 {
	return { x: t.x + t.width / 2, y: t.y + t.height / 2 };
}

/** Rotate a point around a center by `angle` radians. */
export function rotatePointAround(p: Vec2, center: Vec2, angle: number): Vec2 {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const dx = p.x - center.x;
	const dy = p.y - center.y;
	return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** Move an object by a world-space delta. */
export function translateObject(obj: CanvasObject, dx: number, dy: number): void {
	switch (obj.type) {
		case 'stroke':
			for (let i = 0; i < obj.points.length; i += 3) {
				obj.points[i] += dx;
				obj.points[i + 1] += dy;
			}
			break;
		case 'connector':
			obj.startPoint = { x: obj.startPoint.x + dx, y: obj.startPoint.y + dy };
			obj.endPoint = { x: obj.endPoint.x + dx, y: obj.endPoint.y + dy };
			if (obj.waypoints) {
				obj.waypoints = obj.waypoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
			}
			break;
		default:
			obj.transform.x += dx;
			obj.transform.y += dy;
	}
}

/** Scale an object around `origin` (world space). */
export function scaleObject(obj: CanvasObject, origin: Vec2, sx: number, sy: number): void {
	const sxAt = (v: number) => origin.x + (v - origin.x) * sx;
	const syAt = (v: number) => origin.y + (v - origin.y) * sy;
	switch (obj.type) {
		case 'stroke':
			for (let i = 0; i < obj.points.length; i += 3) {
				obj.points[i] = sxAt(obj.points[i]);
				obj.points[i + 1] = syAt(obj.points[i + 1]);
			}
			break;
		case 'connector': {
			const sc = (p: Vec2): Vec2 => ({ x: sxAt(p.x), y: syAt(p.y) });
			obj.startPoint = sc(obj.startPoint);
			obj.endPoint = sc(obj.endPoint);
			if (obj.waypoints) obj.waypoints = obj.waypoints.map(sc);
			break;
		}
		default:
			obj.transform.x = sxAt(obj.transform.x);
			obj.transform.y = syAt(obj.transform.y);
			obj.transform.width *= sx;
			obj.transform.height *= sy;
	}
}

/** Rotate an object around `center` by `angle` radians (box-center convention). */
export function rotateObject(obj: CanvasObject, center: Vec2, angle: number): void {
	switch (obj.type) {
		case 'stroke':
			for (let i = 0; i < obj.points.length; i += 3) {
				const r = rotatePointAround({ x: obj.points[i], y: obj.points[i + 1] }, center, angle);
				obj.points[i] = r.x;
				obj.points[i + 1] = r.y;
			}
			break;
		case 'connector': {
			const rc = (p: Vec2): Vec2 => rotatePointAround(p, center, angle);
			obj.startPoint = rc(obj.startPoint);
			obj.endPoint = rc(obj.endPoint);
			if (obj.waypoints) obj.waypoints = obj.waypoints.map(rc);
			break;
		}
		default: {
			const rotated = rotatePointAround(boxCenter(obj.transform), center, angle);
			obj.transform.x = rotated.x - obj.transform.width / 2;
			obj.transform.y = rotated.y - obj.transform.height / 2;
			obj.transform.rotation = (obj.transform.rotation ?? 0) + angle;
		}
	}
}
