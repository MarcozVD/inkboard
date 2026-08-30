// Camera state — world coordinates independent of screen resolution (§10, §12)

export interface CameraState {
	x: number; // screen-space pan offset X (px)
	y: number; // screen-space pan offset Y (px)
	zoom: number; // scale factor, 1.0 = 100%
	minZoom: number; // e.g. 0.05
	maxZoom: number; // e.g. 32.0
}

export const DEFAULT_CAMERA: CameraState = {
	x: 0,
	y: 0,
	zoom: 1,
	minZoom: 0.05,
	maxZoom: 32.0
};

/** World → screen transform (§12) */
export function worldToScreen(wx: number, wy: number, camera: CameraState): [number, number] {
	return [wx * camera.zoom + camera.x, wy * camera.zoom + camera.y];
}

/** Screen → world transform (§12) */
export function screenToWorld(sx: number, sy: number, camera: CameraState): [number, number] {
	return [(sx - camera.x) / camera.zoom, (sy - camera.y) / camera.zoom];
}

export function clampZoom(zoom: number, camera: CameraState): number {
	return Math.min(camera.maxZoom, Math.max(camera.minZoom, zoom));
}

/**
 * Zoom keeping the world point under `screenX/screenY` stationary.
 * This is the correct zoom-at-cursor math: the world point under the cursor
 * must map to the same screen pixel before and after the zoom change.
 */
export function zoomAt(
	camera: CameraState,
	screenX: number,
	screenY: number,
	factor: number
): CameraState {
	const newZoom = clampZoom(camera.zoom * factor, camera);
	const worldX = (screenX - camera.x) / camera.zoom;
	const worldY = (screenY - camera.y) / camera.zoom;
	return {
		...camera,
		zoom: newZoom,
		x: screenX - worldX * newZoom,
		y: screenY - worldY * newZoom
	};
}

/** Pan by a screen-space delta */
export function pan(camera: CameraState, dx: number, dy: number): CameraState {
	return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/** Reset zoom to 100% keeping the current center point */
export function resetZoom(camera: CameraState, viewportW: number, viewportH: number): CameraState {
	const cx = viewportW / 2;
	const cy = viewportH / 2;
	const worldX = (cx - camera.x) / camera.zoom;
	const worldY = (cy - camera.y) / camera.zoom;
	return {
		...camera,
		zoom: 1,
		x: cx - worldX,
		y: cy - worldY
	};
}
