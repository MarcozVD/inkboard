// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';
import { createShape } from '$lib/objects/factory';
import { deleteObjects } from '$lib/canvas/commands';
import { groupSelection, resolveDoubleClick, ungroupSelection } from './groups';
import { toggleLockSelection } from './lock';

function ev(x: number, y: number) {
	return { screenX: x, screenY: y, pressure: 0.5, shift: false, button: 0 };
}

function setup() {
	const engine = new CanvasEngine({ camera: () => DEFAULT_CAMERA, onDirty: () => {} });
	const a = createShape(0, 0, 50, 50, 'rect');
	const b = createShape(80, 0, 50, 50, 'rect');
	engine.store.addMany([a, b]);
	return { engine, a, b };
}

describe('groups (§M1-05)', () => {
	beforeEach(() => localStorage.clear());

	it('groups the selection; a click selects the whole group; move + undo', () => {
		const { engine, a, b } = setup();
		engine.selectionManager.selectMany([a.id, b.id]);
		expect(groupSelection(engine)).toBe(true);
		expect(a.groupId).toBeTruthy();
		expect(a.groupId).toBe(b.groupId);

		engine.selectionManager.clear();
		engine.selectTool.pointerDown(ev(25, 25));
		engine.selectTool.pointerUp(ev(25, 25));
		expect([...engine.selectionManager.selected].sort()).toEqual([a.id, b.id].sort());

		engine.selectTool.pointerDown(ev(25, 25));
		engine.selectTool.pointerMove(ev(55, 45));
		engine.selectTool.pointerUp(ev(55, 45));
		expect(a.transform.x).toBeCloseTo(30);
		expect(b.transform.x).toBeCloseTo(110);

		engine.history.undo();
		expect(a.transform.x).toBeCloseTo(0);
		expect(b.transform.x).toBeCloseTo(80);
	});

	it('double click enters the group and selects the child', () => {
		const { engine, a, b } = setup();
		engine.selectionManager.selectMany([a.id, b.id]);
		groupSelection(engine);

		const action = resolveDoubleClick(engine, { x: 25, y: 25 });
		expect(action?.kind).toBe('group');
		engine.selectTool.enterGroup(action!.objectId);
		expect(engine.selectionManager.selected).toEqual([a.id]);
	});

	it('ungroup removes the shell and is undoable', () => {
		const { engine, a, b } = setup();
		engine.selectionManager.selectMany([a.id, b.id]);
		groupSelection(engine);
		const hasGroup = () => engine.store.getAll().some((o) => o.type === 'group');

		expect(ungroupSelection(engine)).toBe(true);
		expect(a.groupId).toBeUndefined();
		expect(hasGroup()).toBe(false);

		engine.history.undo();
		expect(hasGroup()).toBe(true);
		expect(a.groupId).toBeTruthy();
	});
});

describe('lock (§M1-06)', () => {
	beforeEach(() => localStorage.clear());

	it('locked objects are not marquee-selected nor deleted, and can be unlocked', () => {
		const { engine, a, b } = setup();
		const sel = engine.selectionManager;
		sel.selectMany([a.id]);
		expect(toggleLockSelection(engine)).toBe(true);
		expect(a.locked).toBe(true);

		sel.clear();
		sel.selectInRect({ x: -10, y: -10, width: 200, height: 100 });
		expect(sel.selected).toEqual([b.id]);

		deleteObjects(engine);
		expect(engine.store.get(a.id)).toBeTruthy();
		expect(engine.store.get(b.id)).toBeUndefined();

		engine.history.undo();
		expect(engine.store.get(b.id)).toBeTruthy();

		// unlock is one more undo step
		engine.history.undo();
		expect(a.locked).toBe(false);
	});

	it('a locked selection cannot be moved', () => {
		const { engine, a } = setup();
		engine.selectionManager.selectMany([a.id]);
		toggleLockSelection(engine);
		engine.selectionManager.clear();

		engine.selectTool.pointerDown(ev(25, 25));
		engine.selectTool.pointerMove(ev(80, 60));
		engine.selectTool.pointerUp(ev(80, 60));
		expect(a.transform.x).toBe(0);
		expect(engine.selectionManager.selected).toEqual([a.id]);
	});
});
