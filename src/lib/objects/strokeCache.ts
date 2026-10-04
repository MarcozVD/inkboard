// strokeCache — Path2D outlines for freehand strokes (M3-02).
//
// `getStroke` (perfect-freehand) used to run for every visible stroke on every
// frame. Outlines only change when the stroke geometry changes, so cache one
// Path2D per stroke and invalidate with a cheap O(1) fingerprint (updatedAt,
// point count and a few sampled coordinates).
import { getStroke } from 'perfect-freehand';
import type { StrokeObject } from '$lib/objects/types';

interface CacheEntry {
	signature: string;
	path: Path2D;
}

/** Bound memory on huge boards; insertion order gives cheap FIFO eviction. */
const MAX_ENTRIES = 5000;
const cache = new Map<string, CacheEntry>();

function outlineOf(stroke: StrokeObject): number[] | null {
	const style = stroke.style;
	if (stroke.smoothedPoints && stroke.smoothedPoints.length >= 4) {
		return stroke.smoothedPoints;
	}
	const points = stroke.points;
	if (points.length < 4) return null;
	const input: number[][] = [];
	for (let i = 0; i < points.length; i += 3) {
		input.push([points[i], points[i + 1], points[i + 2]]);
	}
	const outline = getStroke(input, {
		size: style.width,
		thinning: style.isHighlighter ? 0.35 : 0.65,
		smoothing: 0.5,
		simulatePressure: false,
		start: { taper: style.isHighlighter ? 0 : 40, cap: true },
		end: { taper: style.isHighlighter ? 0 : 40, cap: true }
	});
	return outline.flat();
}

/** O(1) change fingerprint: version + size + first/middle/last samples. */
function signature(stroke: StrokeObject): string {
	const points = stroke.smoothedPoints && stroke.smoothedPoints.length >= 4 ? stroke.smoothedPoints : stroke.points;
	if (points.length < 2) return `empty:${stroke.updatedAt}`;
	const last = points.length - 2;
	const middle = Math.floor(last / 4) * 2;
	return [
		stroke.updatedAt,
		points.length,
		points[0],
		points[1],
		points[middle],
		points[middle + 1],
		points[last],
		points[last + 1]
	].join('|');
}

/**
 * Cached fillable Path2D for a stroke; `null` when it has no drawable outline.
 * The returned path must be treated as immutable (the renderer only fills it).
 */
export function strokeOutlinePath(stroke: StrokeObject): Path2D | null {
	const points = stroke.smoothedPoints && stroke.smoothedPoints.length >= 4 ? stroke.smoothedPoints : stroke.points;
	if (points.length < 4) return null;

	const key = stroke.id;
	const sig = signature(stroke);
	const hit = cache.get(key);
	if (hit && hit.signature === sig) return hit.path;

	const outline = outlineOf(stroke);
	if (!outline || outline.length < 6) {
		cache.delete(key);
		return null;
	}
	const path = new Path2D();
	path.moveTo(outline[0], outline[1]);
	for (let i = 2; i < outline.length; i += 2) {
		path.lineTo(outline[i], outline[i + 1]);
	}
	path.closePath();

	if (!cache.has(key) && cache.size >= MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(key, { signature: sig, path });
	return path;
}

/** Drop every cached outline (tests / hard resets). */
export function clearStrokeCache(): void {
	cache.clear();
}

export function strokeCacheSize(): number {
	return cache.size;
}
