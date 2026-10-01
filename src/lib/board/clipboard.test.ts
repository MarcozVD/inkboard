// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
	CLIPBOARD_MARKER,
	createClipboard,
	parseClipboard,
	remapClipboardObjects,
	serializeClipboard
} from './clipboard';
import { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';
import { createConnector, createShape } from '$lib/objects/factory';
import type { ConnectorObject, GroupObject } from '$lib/objects/types';

describe('clipboard payload', () => {
	it('round-trips objects through the versioned text format', () => {
		const rect = createShape(10, 20, 30, 40, 'rect');
		const payload = serializeClipboard([rect]);
		expect(payload.startsWith(CLIPBOARD_MARKER)).toBe(true);
		expect(parseClipboard(payload)).toEqual([rect]);
	});

	it('rejects foreign, older or malformed payloads', () => {
		expect(parseClipboard('hello world')).toBeNull();
		expect(parseClipboard(`${CLIPBOARD_MARKER}\nnot json`)).toBeNull();
		expect(parseClipboard(`${CLIPBOARD_MARKER}\n{"version":2,"objects":[]}`)).toBeNull();
		expect(parseClipboard(`${CLIPBOARD_MARKER}\n{"version":1}`)).toBeNull();
	});

	it('remaps ids, group children and connector endpoints', () => {
		const shape = createShape(0, 0, 10, 10, 'rect');
		const connector = createConnector({ x: 0, y: 0 }, { x: 10, y: 10 });
		connector.startObjectId = shape.id;
		const group: GroupObject = {
			id: 'group-1',
			type: 'group',
			transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, scaleX: 1, scaleY: 1 },
			style: { opacity: 1 },
			locked: false,
			visible: true,
			createdAt: 0,
			updatedAt: 0,
			childIds: [shape.id]
		};

		const remapped = remapClipboardObjects([shape, connector, group]);
		expect(remapped.map((o) => o.id)).not.toContain(shape.id);
		expect((remapped[1] as ConnectorObject).startObjectId).toBe(remapped[0].id);
		expect((remapped[2] as GroupObject).childIds).toEqual([remapped[0].id]);
	});
});

describe('createClipboard', () => {
	beforeEach(() => localStorage.clear());

	function setup() {
		const engine = new CanvasEngine({ camera: () => DEFAULT_CAMERA, onDirty: () => {} });
		const clipboard = createClipboard({
			getEngine: () => engine,
			getCamera: () => DEFAULT_CAMERA,
			getView: () => ({ width: 800, height: 600 }),
			getCursor: () => null,
			onDirty: () => {}
		});
		return { engine, clipboard };
	}

	it('cut removes the selection and undo restores it', () => {
		const { engine, clipboard } = setup();
		const rect = createShape(0, 0, 10, 10, 'rect');
		engine.store.add(rect);
		engine.selectionManager.select(rect.id);

		clipboard.cutSelection();
		expect(engine.store.size()).toBe(0);

		engine.history.undo();
		expect(engine.store.size()).toBe(1);
	});

	it('repeated paste offsets by 20 and resets after copy', async () => {
		const { engine, clipboard } = setup();
		const rect = createShape(0, 0, 10, 10, 'rect');
		engine.store.add(rect);
		engine.selectionManager.select(rect.id);
		clipboard.copySelection();

		await clipboard.paste({ x: 0, y: 0 });
		const first = engine.store.getAll().find((o) => o.id !== rect.id)!;
		expect(first.transform.x).toBeCloseTo(-5);

		await clipboard.paste({ x: 0, y: 0 });
		const second = engine.store
			.getAll()
			.find((o) => o.id !== rect.id && o.id !== first.id)!;
		expect(second.transform.x).toBeCloseTo(15);
	});
});
