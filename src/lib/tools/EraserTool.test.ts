import { describe, expect, it } from 'vitest';
import { EraserTool } from './EraserTool';
import { ObjectStore } from '$lib/canvas/ObjectStore';
import { HistoryManager, type Command } from '$lib/canvas/HistoryManager';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';
import { createShape } from '$lib/objects/factory';

function makeTool() {
	const store = new ObjectStore();
	const history = new HistoryManager();
	const tool = new EraserTool({
		store,
		camera: () => DEFAULT_CAMERA,
		onDirty: () => {},
		onGestureEnd: () => {},
		execute: (cmd: Command) => history.execute(cmd),
		discardAdded: (id: string) => store.remove(id)
	});
	return { store, history, tool };
}

function ev(x: number, y: number) {
	return { screenX: x, screenY: y, pressure: 0.5, shift: false, button: 0 };
}

describe('EraserTool', () => {
	it('one gesture erasing 3 objects → undo restores all → redo removes them', () => {
		const { store, history, tool } = makeTool();
		store.addMany([
			createShape(0, 0, 100, 100, 'rect'),
			createShape(200, 0, 100, 100, 'rect'),
			createShape(400, 0, 100, 100, 'rect')
		]);
		expect(store.size()).toBe(3);

		tool.pointerDown(ev(50, 50));
		tool.pointerMove(ev(250, 50));
		tool.pointerMove(ev(450, 50));
		tool.pointerUp(ev(450, 50));
		expect(store.size()).toBe(0);

		history.undo();
		expect(store.size()).toBe(3);

		history.redo();
		expect(store.size()).toBe(0);
	});

	it('ignores locked objects', () => {
		const { store, history, tool } = makeTool();
		const locked = createShape(0, 0, 100, 100, 'rect');
		locked.locked = true;
		store.add(locked);

		tool.pointerDown(ev(50, 50));
		tool.pointerMove(ev(60, 60));
		tool.pointerUp(ev(60, 60));
		expect(store.size()).toBe(1);
		expect(history.canUndo).toBe(false);
	});
});
