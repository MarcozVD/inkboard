import { describe, expect, it } from 'vitest';
import {
	clampZoom,
	DEFAULT_CAMERA,
	pan,
	resetZoom,
	screenToWorld,
	worldToScreen,
	zoomAt
} from './Camera';

describe('Camera', () => {
	it('worldToScreen / screenToWorld are inverse at zoom 1, no pan', () => {
		const cam = { ...DEFAULT_CAMERA };
		const w = worldToScreen(100, 50, cam);
		expect(w).toEqual([100, 50]);
		expect(screenToWorld(w[0], w[1], cam)).toEqual([100, 50]);
	});

	it('worldToScreen / screenToWorld are inverse with pan and zoom', () => {
		const cam = { ...DEFAULT_CAMERA, x: 250, y: -120, zoom: 2.5 };
		const w = worldToScreen(30, -40, cam);
		expect(w).toEqual([30 * 2.5 + 250, -40 * 2.5 - 120]);
		const back = screenToWorld(w[0], w[1], cam);
		expect(back[0]).toBeCloseTo(30, 10);
		expect(back[1]).toBeCloseTo(-40, 10);
	});

	it('clamps zoom to min/max', () => {
		const cam = { ...DEFAULT_CAMERA };
		expect(clampZoom(0.001, cam)).toBe(cam.minZoom);
		expect(clampZoom(999, cam)).toBe(cam.maxZoom);
		expect(clampZoom(1, cam)).toBe(1);
	});

	it('zoomAt keeps the world point under the cursor stationary', () => {
		const cam = { ...DEFAULT_CAMERA, x: 100, y: 50, zoom: 1 };
		const sx = 300;
		const sy = 200;
		const worldBefore = screenToWorld(sx, sy, cam);
		const zoomed = zoomAt(cam, sx, sy, 2);
		const worldAfter = screenToWorld(sx, sy, zoomed);
		expect(worldAfter[0]).toBeCloseTo(worldBefore[0], 10);
		expect(worldAfter[1]).toBeCloseTo(worldBefore[1], 10);
		expect(zoomed.zoom).toBe(2);
	});

	it('zoomAt does not exceed max zoom', () => {
		const cam = { ...DEFAULT_CAMERA };
		const zoomed = zoomAt(cam, 100, 100, 1000);
		expect(zoomed.zoom).toBe(cam.maxZoom);
	});

	it('pan shifts camera by delta', () => {
		const cam = { ...DEFAULT_CAMERA, x: 10, y: 20 };
		expect(pan(cam, 5, -5)).toEqual({ ...cam, x: 15, y: 15 });
	});

	it('resetZoom returns to zoom 1 keeping center world point', () => {
		const cam = { ...DEFAULT_CAMERA, x: 400, y: 300, zoom: 0.5 };
		const center = screenToWorld(800 / 2, 600 / 2, cam);
		const reset = resetZoom(cam, 800, 600);
		expect(reset.zoom).toBe(1);
		const newCenter = screenToWorld(400, 300, reset);
		expect(newCenter[0]).toBeCloseTo(center[0], 10);
		expect(newCenter[1]).toBeCloseTo(center[1], 10);
	});
});
