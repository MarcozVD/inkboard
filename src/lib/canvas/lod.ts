// lod — level-of-detail thresholds for low zoom (M3-04).
// Full fidelity is kept at zoom ≥ LOD_ZOOM; below that strokes become
// polylines, tiny text becomes bars and images use reduced bitmaps.

export const LOD_ZOOM = 0.25;
export const TEXT_BAR_PX = 3;
export const REDUCED_MAX_EDGE = 256;

export function isLowDetail(zoom: number): boolean {
	return zoom < LOD_ZOOM;
}

/** True when a text of `fontSize` would render below TEXT_BAR_PX on screen. */
export function textAsBars(fontSize: number, zoom: number): boolean {
	return fontSize * zoom < TEXT_BAR_PX;
}

/** Target size for the reduced image bitmap at low zoom. */
export function reducedSize(
	width: number,
	height: number,
	maxEdge = REDUCED_MAX_EDGE
): { width: number; height: number } {
	const longest = Math.max(width, height, 1);
	const scale = Math.min(1, maxEdge / longest);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}
