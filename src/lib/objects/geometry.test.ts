import { describe, expect, it } from 'vitest';
import {
	applyGeometry,
	captureGeometry,
	localVectorToWorld,
	resizeLocalBox,
	rotateObject,
	scaleObject,
	translateObject,
	worldToLocalVector
} from './geometry';
import { getObjectBounds, transformBounds } from './bounds';
import { createConnector, createShape, createStickyNote, createStroke } from './factory';
import { worldToLocal } from '$lib/utils/math';

describe('geometry — local resize (§M1-13)', () => {
	const BOX = { width: 100, height: 100 };

	it('resizes along local axes keeping the opposite edge fixed', () => {
		const r = resizeLocalBox({ handle: 'e', box: BOX, pointer: { x: 80, y: 0 } });
		expect(r.width).toBe(130);
		expect(r.signX).toBe(1);
		expect(r.center.x).toBeCloseTo(15);
		expect(r.center.y).toBe(0);
	});

	it('flips when the pointer crosses the opposite edge', () => {
		const r = resizeLocalBox({ handle: 'e', box: BOX, pointer: { x: -80, y: 0 } });
		expect(r.width).toBe(30);
		expect(r.signX).toBe(-1);
		expect(r.center.x).toBeCloseTo(-65);
	});

	it('clamps to the minimum size keeping the flip sign', () => {
		const r = resizeLocalBox({ handle: 'e', box: BOX, pointer: { x: -51, y: 0 } });
		expect(r.width).toBe(4);
		expect(r.signX).toBe(-1);
		expect(r.center.x).toBeCloseTo(-52);
	});

	it('keeps the aspect ratio with Shift on corners', () => {
		const r = resizeLocalBox({
			handle: 'se',
			box: { width: 100, height: 50 },
			pointer: { x: 100, y: 10 },
			shift: true
		});
		expect(r.width).toBeCloseTo(150);
		expect(r.height).toBeCloseTo(75);
		expect(r.center.x).toBeCloseTo(-50 + 75);
		expect(r.center.y).toBeCloseTo(-25 + 37.5);
	});

	it('maps a 45° rotated resize to world coordinates', () => {
		const center = { x: 10, y: 20 };
		const rotation = Math.PI / 4;
		const local = resizeLocalBox({ handle: 'e', box: BOX, pointer: { x: 80, y: 0 } });
		const worldCenter = localVectorToWorld(local.center, center, rotation);
		expect(local.width).toBe(130);
		expect(worldCenter.x).toBeCloseTo(10 + 15 * Math.SQRT1_2);
		expect(worldCenter.y).toBeCloseTo(20 + 15 * Math.SQRT1_2);

		// pointer round-trip through the local frame
		const back = worldToLocalVector(worldCenter, center, rotation);
		expect(back.x).toBeCloseTo(15);
		expect(back.y).toBeCloseTo(0);
	});
});

describe('geometry — translate', () => {
	it('moves transform-based objects', () => {
		const rect = createShape(10, 20, 100, 50, 'rect');
		translateObject(rect, 5, -7);
		expect(rect.transform.x).toBe(15);
		expect(rect.transform.y).toBe(13);
	});

	it('moves stroke points and the bounds follow', () => {
		const stroke = createStroke([0, 0, 1, 10, 10, 1, 20, 5, 1]);
		translateObject(stroke, 3, 4);
		expect(stroke.points.slice(0, 6)).toEqual([3, 4, 1, 13, 14, 1]);
		const b = getObjectBounds(stroke);
		expect(b.x).toBeCloseTo(3 - stroke.style.width / 2);
		expect(b.y).toBeCloseTo(4 - stroke.style.width / 2);
	});

	it('moves connector endpoints and waypoints', () => {
		const c = createConnector({ x: 0, y: 0 }, { x: 100, y: 50 });
		c.waypoints = [{ x: 50, y: 25 }];
		translateObject(c, 10, -10);
		expect(c.startPoint).toEqual({ x: 10, y: -10 });
		expect(c.endPoint).toEqual({ x: 110, y: 40 });
		expect(c.waypoints[0]).toEqual({ x: 60, y: 15 });
	});
});

describe('geometry — scale', () => {
	it('scales transform objects around the origin', () => {
		const rect = createShape(10, 10, 100, 50, 'rect');
		scaleObject(rect, { x: 0, y: 0 }, 2, 0.5);
		expect(rect.transform.x).toBe(20);
		expect(rect.transform.y).toBe(5);
		expect(rect.transform.width).toBe(200);
		expect(rect.transform.height).toBe(25);
	});

	it('scales stroke points around the origin', () => {
		const stroke = createStroke([10, 10, 1, 30, 20, 1]);
		scaleObject(stroke, { x: 10, y: 10 }, 2, 3);
		expect(stroke.points.slice(0, 6)).toEqual([10, 10, 1, 50, 40, 1]);
	});

	it('scales connector points around the origin', () => {
		const c = createConnector({ x: 0, y: 0 }, { x: 10, y: 10 });
		scaleObject(c, { x: 0, y: 0 }, 2, 2);
		expect(c.endPoint).toEqual({ x: 20, y: 20 });
	});
});

describe('geometry — rotate (box-center convention)', () => {
	it('rotates a box around its own center without translating it', () => {
		const rect = createShape(0, 0, 100, 100, 'rect');
		rotateObject(rect, { x: 50, y: 50 }, Math.PI / 2);
		expect(rect.transform.x).toBeCloseTo(0);
		expect(rect.transform.y).toBeCloseTo(0);
		expect(rect.transform.rotation).toBeCloseTo(Math.PI / 2);
	});

	it('rotates a box around an external center', () => {
		const rect = createShape(0, 0, 100, 100, 'rect');
		rotateObject(rect, { x: 0, y: 0 }, Math.PI / 2);
		// box center (50,50) -> (-50,50)
		expect(rect.transform.x).toBeCloseTo(-100);
		expect(rect.transform.y).toBeCloseTo(0);
		expect(rect.transform.rotation).toBeCloseTo(Math.PI / 2);
	});

	it('rotates stroke points around a center', () => {
		const stroke = createStroke([10, 0, 1, 0, 10, 1]);
		rotateObject(stroke, { x: 0, y: 0 }, Math.PI / 2);
		expect(stroke.points[0]).toBeCloseTo(0);
		expect(stroke.points[1]).toBeCloseTo(10);
		expect(stroke.points[3]).toBeCloseTo(-10);
		expect(stroke.points[4]).toBeCloseTo(0);
	});

	it('hits the rotated corner of a 45° rect, not the AABB corner (B12)', () => {
		const rect = createShape(300, 200, 200, 200, 'rect');
		rotateObject(rect, { x: 400, y: 300 }, Math.PI / 4);

		const rotatedCorner = worldToLocal({ x: 538, y: 298 }, rect.transform);
		expect(rotatedCorner.x).toBeGreaterThan(0);
		expect(rotatedCorner.x).toBeLessThan(200);
		expect(rotatedCorner.y).toBeGreaterThan(0);
		expect(rotatedCorner.y).toBeLessThan(200);

		const aabbCorner = worldToLocal({ x: 595, y: 395 }, rect.transform);
		expect(aabbCorner.x).toBeGreaterThan(200);
	});

	it('captures and restores geometry snapshots', () => {
		const stroke = createStroke([0, 0, 1, 10, 10, 1]);
		const snap = captureGeometry(stroke);
		translateObject(stroke, 5, 5);
		applyGeometry(stroke, snap);
		expect(stroke.points.slice(0, 3)).toEqual([0, 0, 1]);
	});
});

describe('getObjectBounds — rotated AABB (B12)', () => {
	it('keeps the box for 0°', () => {
		const rect = createShape(10, 20, 100, 50, 'rect');
		expect(transformBounds(rect.transform)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
	});

	it('swaps extents for 90°', () => {
		const rect = createShape(10, 20, 100, 50, 'rect');
		rect.transform.rotation = Math.PI / 2;
		const b = transformBounds(rect.transform);
		expect(b.x).toBeCloseTo(35);
		expect(b.y).toBeCloseTo(-5);
		expect(b.width).toBeCloseTo(50);
		expect(b.height).toBeCloseTo(100);
	});

	it('inflates the AABB for 45°', () => {
		const rect = createShape(0, 0, 100, 100, 'rect');
		rect.transform.rotation = Math.PI / 4;
		const b = transformBounds(rect.transform);
		const half = (100 * Math.SQRT2) / 2;
		expect(b.x).toBeCloseTo(50 - half);
		expect(b.width).toBeCloseTo(half * 2);
	});

	it('uses the same convention for text/sticky/image', () => {
		const sticky = createStickyNote(0, 0, 'x');
		sticky.transform.rotation = Math.PI / 4;
		const b = getObjectBounds(sticky);
		expect(b.width).toBeCloseTo(((220 + 200) * Math.SQRT2) / 2);
	});
});
