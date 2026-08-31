import { describe, expect, it } from 'vitest';
import { PenTool, simplifyStroke } from './PenTool';
import { ObjectStore } from '$lib/canvas/ObjectStore';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';

function makePen() {
	const store = new ObjectStore();
	const pen = new PenTool({ store, camera: () => DEFAULT_CAMERA, onDirty: () => {} });
	return { store, pen };
}

describe('PenTool', () => {
	it('creates a stroke object on pointerDown', () => {
		const { store, pen } = makePen();
		pen.pointerDown({ screenX: 100, screenY: 100, pressure: 0.5, shift: false, button: 0 });
		expect(store.size()).toBe(1);
		const stroke = store.getAll()[0];
		expect(stroke.type).toBe('stroke');
		// zoom 1, no pan → world == screen
		expect(stroke.points).toEqual([100, 100, 0.5]);
	});

	it('appends points on pointerMove and simplifies on up', () => {
		const { store, pen } = makePen();
		pen.pointerDown({ screenX: 0, screenY: 0, pressure: 0.5, shift: false, button: 0 });
		for (let i = 1; i <= 50; i++) {
			pen.pointerMove({ screenX: i, screenY: i, pressure: 0.5, shift: false, button: 0 });
		}
		const stroke = store.getAll()[0];
		expect(stroke.points.length).toBeGreaterThan(3 * 5);
		pen.pointerUp({ button: 0, pressure: 0.5 });
	});

	it('does not create extra objects on move/up', () => {
		const { store, pen } = makePen();
		pen.pointerDown({ screenX: 0, screenY: 0, pressure: 0.5, shift: false, button: 0 });
		pen.pointerMove({ screenX: 10, screenY: 10, pressure: 0.5, shift: false, button: 0 });
		pen.pointerUp({ button: 0, pressure: 0.5 });
		expect(store.size()).toBe(1);
	});

	it('respects min distance (skips jittery same-point moves)', () => {
		const { store, pen } = makePen();
		pen.pointerDown({ screenX: 0, screenY: 0, pressure: 0.5, shift: false, button: 0 });
		pen.pointerMove({ screenX: 0.5, screenY: 0.3, pressure: 0.5, shift: false, button: 0 });
		const stroke = store.getAll()[0];
		expect(stroke.points).toHaveLength(3); // only the down point
	});

	it('normalizes zero pressure to 0.5 (mouse)', () => {
		const { store, pen } = makePen();
		pen.pointerDown({ screenX: 5, screenY: 5, pressure: 0, shift: false, button: 0 });
		expect(store.getAll()[0].points[2]).toBe(0.5);
	});

	it('reset clears active stroke without leaking', () => {
		const { store, pen } = makePen();
		pen.pointerDown({ screenX: 0, screenY: 0, pressure: 0.5, shift: false, button: 0 });
		pen.reset();
		pen.pointerMove({ screenX: 20, screenY: 20, pressure: 0.5, shift: false, button: 0 });
		expect(store.getAll()[0].points).toHaveLength(3); // unchanged
	});
});

describe('simplifyStroke (RDP)', () => {
	it('keeps a straight line to 2 points', () => {
		const pts: number[] = [];
		for (let i = 0; i <= 100; i++) pts.push(i, i, 0.5);
		const out = simplifyStroke(pts, 0.5);
		expect(out.length).toBeGreaterThanOrEqual(6); // ≥2 points
		expect(out.length).toBeLessThan(pts.length);
	});

	it('keeps endpoints of a curve', () => {
		const pts: number[] = [];
		for (let i = 0; i <= 50; i++) {
			const t = i / 50;
			pts.push(t * 100, Math.sin(t * Math.PI) * 50, 0.5);
		}
		const out = simplifyStroke(pts, 0.5);
		// flattened [x,y,p,...] — first x and last x
		expect(out[0]).toBe(0);
		expect(out[out.length - 3]).toBeCloseTo(100);
	});

	it('returns input when too short', () => {
		expect(simplifyStroke([0, 0, 0.5, 10, 10, 0.5])).toEqual([0, 0, 0.5, 10, 10, 0.5]);
	});
});
