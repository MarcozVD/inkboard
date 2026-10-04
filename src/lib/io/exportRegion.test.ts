import { describe, expect, it } from 'vitest';
import { EXPORT_PAD, clampScale, computeExportFrame, objectsBounds, viewportRegion } from './exportRegion';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';
import { createShape } from '$lib/objects/factory';

const rect = (x: number, y: number, width: number, height: number) => createShape(x, y, width, height, 'rect');

describe('objectsBounds', () => {
	it('unions object AABBs and returns null when empty', () => {
		expect(objectsBounds([])).toBeNull();
		const bounds = objectsBounds([rect(10, 20, 100, 50), rect(200, 100, 10, 10)]);
		expect(bounds).toEqual({ minX: 10, minY: 20, width: 200, height: 90 });
	});
});

describe('viewportRegion', () => {
	it('maps the camera to the exact visible world rect', () => {
		const region = viewportRegion(DEFAULT_CAMERA, { width: 800, height: 600 });
		expect(region).toEqual({ minX: 0, minY: 0, width: 800, height: 600 });

		const zoomed = viewportRegion({ ...DEFAULT_CAMERA, x: -100, y: 50, zoom: 2 }, { width: 800, height: 600 });
		expect(zoomed).toEqual({ minX: 50, minY: -25, width: 400, height: 300 });
	});
});

describe('computeExportFrame', () => {
	const camera = DEFAULT_CAMERA;
	const view = { width: 1000, height: 800 };
	const objects = [rect(300, 200, 200, 150), rect(700, 200, 100, 100)];

	it('board mode pads the union bounds and scales the pixels', () => {
		const frame = computeExportFrame({ objects, mode: 'board', camera, view, scale: 2 });
		expect(frame?.region).toEqual({ minX: 280, minY: 180, width: 540, height: 190 });
		expect(frame?.width).toBe((500 + EXPORT_PAD * 2) * 2);
		expect(frame?.height).toBe((150 + EXPORT_PAD * 2) * 2);
	});

	it('selection mode only uses the selected objects', () => {
		const selection = [objects[0]];
		const frame = computeExportFrame({ objects, mode: 'selection', camera, view, scale: 1, selection });
		expect(frame?.region).toEqual({ minX: 280, minY: 180, width: 240, height: 190 });
		expect(frame?.width).toBe(240);
		expect(frame?.height).toBe(190);
		expect(computeExportFrame({ objects, mode: 'selection', camera, view, scale: 1, selection: [] })).toBeNull();
	});

	it('viewport mode exports the visible world rect without padding', () => {
		const frame = computeExportFrame({ objects, mode: 'viewport', camera, view, scale: 1 });
		expect(frame?.region).toEqual({ minX: 0, minY: 0, width: 1000, height: 800 });
		expect(frame?.width).toBe(1000);
		expect(frame?.height).toBe(800);
	});

	it('empty board has no board frame and scales up to 4×', () => {
		expect(computeExportFrame({ objects: [], mode: 'board', camera, view, scale: 2 })).toBeNull();
		const maxScale = computeExportFrame({ objects, mode: 'viewport', camera, view, scale: 4 });
		expect(maxScale?.width).toBe(4000);
		expect(maxScale?.height).toBe(3200);
		expect(clampScale(9)).toBe(4);
		expect(clampScale(0)).toBe(1);
	});
});
