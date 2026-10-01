// snapping — grid/axis/angle constraints (§M1-07).
import type { Vec2 } from '$lib/utils/math';

/** Constrain a movement delta to one axis when `constrain` is set (Shift). */
export function constrainToAxis(dx: number, dy: number, constrain: boolean): Vec2 {
	if (!constrain) return { x: dx, y: dy };
	return Math.abs(dx) >= Math.abs(dy) ? { x: dx, y: 0 } : { x: 0, y: dy };
}

/** Snap a world coordinate to the nearest grid line. */
export function snapValue(value: number, size: number): number {
	if (size <= 0) return value;
	return Math.round(value / size) * size;
}

/** Translation that snaps a point (usually a bounds origin) to the grid. */
export function snapOffset(x: number, y: number, size: number): Vec2 {
	return { x: snapValue(x, size) - x, y: snapValue(y, size) - y };
}

/** Round an angle delta to steps of `step` radians (15° by default, Shift). */
export function snapAngle(angle: number, step = Math.PI / 12): number {
	if (step <= 0) return angle;
	return Math.round(angle / step) * step;
}
