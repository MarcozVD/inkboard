// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageTool } from './ImageTool';
import { ObjectStore } from '$lib/canvas/ObjectStore';
import { HistoryManager, type Command } from '$lib/canvas/HistoryManager';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';

/** Minimal Image stand-in: fires onload on the next microtask when src is set. */
class FakeImage {
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	width = 64;
	height = 32;
	set src(_value: string) {
		queueMicrotask(() => this.onload?.());
	}
}

function makeTool() {
	const store = new ObjectStore();
	const history = new HistoryManager();
	const tool = new ImageTool({
		store,
		camera: () => DEFAULT_CAMERA,
		onDirty: () => {},
		execute: (cmd: Command) => history.execute(cmd),
		discardAdded: (id: string) => store.remove(id)
	});
	return { store, history, tool };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ImageTool — history (B13)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('insertImage registers a single undo/redo step', async () => {
		vi.stubGlobal('Image', FakeImage);
		const { store, history, tool } = makeTool();

		tool.insertImage('data:image/png;base64,AAAA', 'x.png', 100, 100);
		await flush();

		expect(store.size()).toBe(1);
		expect(store.getAll()[0].type).toBe('image');
		expect(history.canUndo).toBe(true);

		history.undo();
		expect(store.size()).toBe(0);

		history.redo();
		expect(store.size()).toBe(1);
	});
});
