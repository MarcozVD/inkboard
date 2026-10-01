import { describe, expect, it } from 'vitest';
import { InputController, type PointerLike } from './InputController';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';
import type { CameraState } from '$lib/canvas/Camera';

function makeController() {
	const calls: string[] = [];
	let camera: CameraState = { ...DEFAULT_CAMERA };
	const controller = new InputController({
		canvas: () => null,
		isSpaceDown: () => false,
		getCamera: () => camera,
		setCamera: (c) => (camera = c),
		onToolPointerDown: (p) => calls.push(`down:${p.x},${p.y}`),
		onToolPointerMove: (p) => calls.push(`move:${p.x},${p.y}`),
		onToolPointerUp: () => calls.push('up'),
		onDirty: () => {}
	});
	controller.rect = { left: 10, top: 20, width: 800, height: 600 };
	return { controller, calls, camera: () => camera };
}

function pointer(overrides: Partial<PointerLike> = {}): PointerLike {
	return {
		pointerId: 1,
		button: 0,
		shiftKey: false,
		pressure: 0.5,
		clientX: 100,
		clientY: 60,
		...overrides
	};
}

describe('InputController', () => {
	it('routes a single pointer to the tool in canvas-local coords', () => {
		const { controller, calls } = makeController();
		controller.pointerDown(pointer());
		controller.pointerMove(pointer({ clientX: 120, clientY: 80 }));
		controller.pointerUp(pointer());
		expect(calls).toEqual(['down:90,40', 'move:110,60', 'up']);
	});

	it('pans with the middle button without routing to the tool', () => {
		const { controller, calls, camera } = makeController();
		controller.pointerDown(pointer({ button: 1 }));
		controller.pointerMove(pointer({ clientX: 150, clientY: 100 }));
		controller.pointerUp(pointer({ button: 1 }));
		expect(calls).toEqual([]);
		expect(camera().x).toBe(50);
		expect(camera().y).toBe(40);
	});

	it('pinch-zooms with two pointers without routing moves', () => {
		const { controller, calls, camera } = makeController();
		controller.pointerDown(pointer({ pointerId: 1, clientX: 100, clientY: 100 }));
		controller.pointerDown(pointer({ pointerId: 2, clientX: 200, clientY: 100 }));
		controller.pointerMove(pointer({ pointerId: 1, clientX: 50, clientY: 100 }));
		controller.pointerMove(pointer({ pointerId: 2, clientX: 250, clientY: 100 }));
		expect(calls).toEqual(['down:90,80']);
		expect(camera().zoom).toBeGreaterThan(1);
		controller.pointerUp(pointer({ pointerId: 1 }));
		controller.pointerUp(pointer({ pointerId: 2 }));
		// the pinch ends with a single tool pointerUp, never with moves
		expect(calls).toEqual(['down:90,80', 'up']);
	});

	it('zooms with Ctrl+wheel and pans with plain wheel', () => {
		const { controller, camera } = makeController();
		controller.wheel({ deltaX: 0, deltaY: -100, ctrlKey: true, clientX: 100, clientY: 60 });
		expect(camera().zoom).toBeGreaterThan(1);
		const afterZoom = camera();
		controller.wheel({ deltaX: 10, deltaY: 20, ctrlKey: false, clientX: 100, clientY: 60 });
		expect(camera().x).toBe(afterZoom.x - 10);
		expect(camera().y).toBe(afterZoom.y - 20);
		expect(camera().zoom).toBe(afterZoom.zoom);
	});
});
