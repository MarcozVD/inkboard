// exportRegion — export frame per mode (M2-09): board, selection, visible area.
import { getObjectBounds } from '$lib/objects/bounds';
import type { CanvasObject } from '$lib/objects/types';
import type { CameraState } from '$lib/canvas/Camera';

export type ExportMode = 'board' | 'selection' | 'viewport';
export type ExportScale = 1 | 2 | 3 | 4;

export interface ExportRegion {
	minX: number;
	minY: number;
	width: number;
	height: number;
}

export interface ExportFrame {
	region: ExportRegion;
	/** output pixel size at the requested scale */
	width: number;
	height: number;
}

export interface FrameInput {
	objects: CanvasObject[];
	mode: ExportMode;
	camera: CameraState;
	view: { width: number; height: number };
	scale: ExportScale;
	selection?: CanvasObject[];
}

/** Breathing room (world px) around board/selection exports. */
export const EXPORT_PAD = 20;

export const EXPORT_MODES: { value: ExportMode; label: string }[] = [
	{ value: 'board', label: 'Whole board' },
	{ value: 'selection', label: 'Selection' },
	{ value: 'viewport', label: 'Visible area' }
];

export const EXPORT_SCALES: ExportScale[] = [1, 2, 3, 4];

export function clampScale(scale: number): ExportScale {
	return Math.min(4, Math.max(1, Math.round(scale))) as ExportScale;
}

/** Union AABB of the objects; `null` when there is nothing to bound. */
export function objectsBounds(objects: CanvasObject[]): ExportRegion | null {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const obj of objects) {
		const bounds = getObjectBounds(obj);
		minX = Math.min(minX, bounds.x);
		minY = Math.min(minY, bounds.y);
		maxX = Math.max(maxX, bounds.x + bounds.width);
		maxY = Math.max(maxY, bounds.y + bounds.height);
	}
	if (!isFinite(minX)) return null;
	return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Exact world rectangle currently visible through the camera. */
export function viewportRegion(camera: CameraState, view: { width: number; height: number }): ExportRegion {
	const zoom = camera.zoom || 1;
	return {
		// `|| 0` normalizes -0 to 0 (deep equality in tests / stable JSON)
		minX: -camera.x / zoom || 0,
		minY: -camera.y / zoom || 0,
		width: Math.max(1, view.width / zoom),
		height: Math.max(1, view.height / zoom)
	};
}

function padded(region: ExportRegion, pad: number): ExportRegion {
	return {
		minX: region.minX - pad,
		minY: region.minY - pad,
		width: region.width + pad * 2,
		height: region.height + pad * 2
	};
}

/**
 * World region + output pixel size for an export.
 * Returns `null` when the mode has nothing to export (empty board/selection).
 */
export function computeExportFrame(input: FrameInput): ExportFrame | null {
	const scale = clampScale(input.scale);
	let region: ExportRegion | null;
	switch (input.mode) {
		case 'viewport':
			region = viewportRegion(input.camera, input.view);
			break;
		case 'selection':
			region = objectsBounds(input.selection ?? []);
			region = region ? padded(region, EXPORT_PAD) : null;
			break;
		default:
			region = objectsBounds(input.objects);
			region = region ? padded(region, EXPORT_PAD) : null;
	}
	if (!region) return null;
	return {
		region,
		width: Math.max(1, Math.round(region.width * scale)),
		height: Math.max(1, Math.round(region.height * scale))
	};
}
