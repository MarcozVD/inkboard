import { describe, expect, it } from 'vitest';
import { ShapeTool } from './ShapeTool';
import { ObjectStore } from '$lib/canvas/ObjectStore';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';

function makeShape() {
	const store = new ObjectStore();
	const tool = new ShapeTool({ store, camera: () => DEFAULT_CAMERA, onDirty: () => {} });
	return { store, tool };
}

function ev(x: number, y: number, shift = false) {
	return { screenX: x, screenY: y, pressure: 0.5, shift, button: 0 };
}

describe('ShapeTool', () => {
	it('creates a shape from drag start to end (top-left anchor)', () => {
		const { store, tool } = makeShape();
		tool.pointerDown(ev(100, 100));
		tool.pointerMove(ev(300, 250));
		tool.pointerUp(ev(300, 250));
		expect(store.size()).toBe(1);
		const s = store.getAll()[0];
		expect(s.type).toBe('shape');
		expect(s.transform.x).toBe(100);
		expect(s.transform.y).toBe(100);
		expect(s.transform.width).toBe(200);
		expect(s.transform.height).toBe(150);
	});

	it('normalizes negative drag direction', () => {
		const { store, tool } = makeShape();
		tool.pointerDown(ev(300, 250));
		tool.pointerMove(ev(100, 100));
		tool.pointerUp(ev(100, 100));
		const s = store.getAll()[0];
		expect(s.transform.x).toBe(100);
		expect(s.transform.y).toBe(100);
		expect(s.transform.width).toBe(200);
		expect(s.transform.height).toBe(150);
	});

	it('keeps aspect ratio with Shift', () => {
		const { store, tool } = makeShape();
		tool.pointerDown(ev(100, 100));
		tool.pointerMove(ev(300, 150, true)); // w=200, h=50 → square 200x200
		tool.pointerUp(ev(300, 150, true));
		const s = store.getAll()[0];
		expect(s.transform.width).toBe(200);
		expect(s.transform.height).toBe(200);
	});

	it('discards tiny accidental clicks', () => {
		const { store, tool } = makeShape();
		tool.pointerDown(ev(100, 100));
		tool.pointerMove(ev(101, 101));
		tool.pointerUp(ev(101, 101));
		expect(store.size()).toBe(0);
	});

	it('uses configured shape type', () => {
		const { store, tool } = makeShape();
		tool.config.shape = 'ellipse';
		tool.pointerDown(ev(0, 0));
		tool.pointerMove(ev(50, 50));
		tool.pointerUp(ev(50, 50));
		expect((store.getAll()[0] as { shape: string }).shape).toBe('ellipse');
	});
});
