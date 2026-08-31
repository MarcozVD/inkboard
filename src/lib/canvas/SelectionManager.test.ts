import { describe, expect, it } from 'vitest';
import { ObjectStore } from './ObjectStore';
import { SelectionManager, pointInObject } from './SelectionManager';
import { createShape, createStroke, createText } from '$lib/objects/factory';

function rectSel() {
	const store = new ObjectStore();
	const sel = new SelectionManager(store);
	return { store, sel };
}

describe('SelectionManager — hit-testing', () => {
	it('hits a rect shape by point', () => {
		const { store, sel } = rectSel();
		store.add(createShape(0, 0, 100, 100, 'rect'));
		expect(sel.hitTest({ x: 50, y: 50 })?.type).toBe('shape');
		expect(sel.hitTest({ x: 150, y: 150 })).toBeNull();
	});

	it('hits an ellipse only inside the ellipse', () => {
		const { store, sel } = rectSel();
		store.add(createShape(0, 0, 100, 100, 'ellipse'));
		// center is inside
		expect(sel.hitTest({ x: 50, y: 50 })).not.toBeNull();
		// corner of the AABB is outside the ellipse
		expect(sel.hitTest({ x: 2, y: 2 })).toBeNull();
	});

	it('hits a rotated rect via local-space test', () => {
		const { store, sel } = rectSel();
		const rect = createShape(0, 0, 100, 100, 'rect');
		rect.transform.rotation = Math.PI / 4;
		store.add(rect);
		// A point near the AABB corner that is outside the rotated rect
		// (rotation makes the true shape smaller along axes)
		expect(sel.hitTest({ x: 96, y: 2 })).toBeNull();
		// center still inside
		expect(sel.hitTest({ x: 50, y: 50 })).not.toBeNull();
	});

	it('hits a stroke only near its path', () => {
		const { store, sel } = rectSel();
		store.add(createStroke([0, 0, 1, 100, 0, 1], { width: 4 }));
		expect(sel.hitTest({ x: 50, y: 1 })).not.toBeNull();
		expect(sel.hitTest({ x: 50, y: 50 })).toBeNull();
	});

	it('hits a line/arrow shape near its segment', () => {
		const { store, sel } = rectSel();
		store.add(createShape(0, 0, 100, 100, 'line', { strokeWidth: 2 }));
		expect(sel.hitTest({ x: 50, y: 50 })).not.toBeNull();
		expect(sel.hitTest({ x: 5, y: 95 })).toBeNull();
	});

	it('hits a text object by its box', () => {
		const { store, sel } = rectSel();
		store.add(createText(0, 0, 'hello'));
		expect(sel.hitTest({ x: 5, y: 5 })).not.toBeNull();
	});

	it('returns topmost object when overlapping', () => {
		const { store, sel } = rectSel();
		const a = createShape(0, 0, 100, 100, 'rect');
		const b = createShape(0, 0, 100, 100, 'rect');
		store.add(a); // z=0
		store.add(b); // z=1
		expect(sel.hitTest({ x: 50, y: 50 })?.id).toBe(b.id);
	});
});

describe('SelectionManager — selection state', () => {
	it('select/additive/toggle/deselect/clear', () => {
		const { store, sel } = rectSel();
		const a = createShape(0, 0, 10, 10, 'rect');
		const b = createShape(0, 0, 10, 10, 'rect');
		store.add(a);
		store.add(b);

		sel.select(a.id);
		expect(sel.selected).toEqual([a.id]);

		sel.select(b.id, true);
		expect(sel.selected.sort()).toEqual([a.id, b.id].sort());

		sel.toggle(a.id);
		expect(sel.selected).toEqual([b.id]);

		sel.deselect(b.id);
		expect(sel.selected).toEqual([]);

		sel.select(a.id);
		sel.select(b.id);
		sel.clear();
		expect(sel.selected).toEqual([]);
	});

	it('selectInRect only selects objects intersecting the rect', () => {
		const { store, sel } = rectSel();
		store.add(createShape(0, 0, 50, 50, 'rect'));
		store.add(createShape(200, 200, 50, 50, 'rect'));
		const ids = sel.selectInRect({ x: 0, y: 0, width: 100, height: 100 });
		expect(ids).toHaveLength(1);
		expect(sel.selected).toHaveLength(1);
	});

	it('getSelectionBounds unions selected objects', () => {
		const { store, sel } = rectSel();
		store.add(createShape(0, 0, 50, 50, 'rect'));
		store.add(createShape(100, 100, 50, 50, 'rect'));
		sel.selectMany([...store.getAll().map((o) => o.id)]);
		const bounds = sel.getSelectionBounds();
		expect(bounds).toEqual({ x: 0, y: 0, width: 150, height: 150 });
	});

	it('getHandles returns 8 resize + 1 rotate handles', () => {
		const { store, sel } = rectSel();
		store.add(createShape(0, 0, 100, 100, 'rect'));
		sel.select(store.getAll()[0].id);
		const handles = sel.getHandles((x, y) => [x, y]);
		expect(handles).toHaveLength(9);
		expect(handles.map((h) => h.id)).toContain('rotate');
	});
});

describe('pointInObject', () => {
	it('false for locked-out-of-bounds points', () => {
		const { store } = rectSel();
		const rect = createShape(0, 0, 10, 10, 'rect');
		store.add(rect);
		expect(pointInObject(rect, { x: 5, y: 5 })).toBe(true);
		expect(pointInObject(rect, { x: 50, y: 50 })).toBe(false);
	});
});
