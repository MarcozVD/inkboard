import { describe, expect, it } from 'vitest';
import { ObjectStore } from './ObjectStore';
import { createShape, createText } from '$lib/objects/factory';

describe('ObjectStore', () => {
	it('adds and retrieves objects', () => {
		const store = new ObjectStore();
		const rect = createShape(0, 0, 100, 100, 'rect');
		store.add(rect);
		expect(store.get(rect.id)).toBe(rect);
		expect(store.size()).toBe(1);
	});

	it('assigns increasing zIndex on add', () => {
		const store = new ObjectStore();
		const a = createShape(0, 0, 10, 10, 'rect');
		const b = createShape(0, 0, 10, 10, 'rect');
		store.add(a);
		store.add(b);
		expect(a.zIndex).toBe(0);
		expect(b.zIndex).toBe(1);
		expect(store.sortedByZ().map((o) => o.id)).toEqual([a.id, b.id]);
	});

	it('updates objects and keeps spatial index in sync', () => {
		const store = new ObjectStore();
		const rect = createShape(0, 0, 100, 100, 'rect');
		store.add(rect);

		// in viewport initially
		expect(store.queryViewport({ x: 0, y: 0, width: 100, height: 100 })).toHaveLength(1);

		// move it far away
		store.update(rect.id, { transform: { ...rect.transform, x: 1000, y: 1000 } });
		expect(store.queryViewport({ x: 0, y: 0, width: 100, height: 100 })).toHaveLength(0);
		expect(store.queryViewport({ x: 1000, y: 1000, width: 100, height: 100 })).toHaveLength(1);
	});

	it('removes objects', () => {
		const store = new ObjectStore();
		const a = createShape(0, 0, 10, 10, 'rect');
		const b = createShape(0, 0, 10, 10, 'rect');
		store.add(a);
		store.add(b);
		expect(store.remove(a.id)).toBe(true);
		expect(store.get(a.id)).toBeUndefined();
		expect(store.size()).toBe(1);
		expect(store.remove('nonexistent')).toBe(false);
	});

	it('emits change events with added/modified/removed', () => {
		const store = new ObjectStore();
		const events: string[] = [];
		store.onChange((ev) => {
			if (ev.added.length) events.push('add');
			if (ev.modified.length) events.push('modify');
			if (ev.removed.length) events.push('remove');
		});

		const a = createShape(0, 0, 10, 10, 'rect');
		store.add(a);
		store.update(a.id, { style: { ...a.style, opacity: 0.5 } });
		store.remove(a.id);
		expect(events).toEqual(['add', 'modify', 'remove']);
	});

	it('queryPoint returns candidates via spatial index', () => {
		const store = new ObjectStore();
		store.add(createShape(0, 0, 100, 100, 'rect'));
		expect(store.queryPoint({ x: 50, y: 50 })).toHaveLength(1);
		expect(store.queryPoint({ x: 500, y: 500 })).toHaveLength(0);
	});

	it('bringToFront reorders z-index', () => {
		const store = new ObjectStore();
		const a = createShape(0, 0, 10, 10, 'rect');
		const b = createShape(0, 0, 10, 10, 'rect');
		const c = createShape(0, 0, 10, 10, 'rect');
		store.add(a);
		store.add(b);
		store.add(c);

		store.bringToFront([a.id]);
		const order = store.sortedByZ().map((o) => o.id);
		expect(order).toEqual([b.id, c.id, a.id]);
	});

	it('addMany adds all in one batch with spatial index', () => {
		const store = new ObjectStore();
		const objs = Array.from({ length: 100 }, (_, i) => createShape(i * 200, i * 200, 50, 50, 'rect'));
		store.addMany(objs);
		expect(store.size()).toBe(100);
		expect(store.queryViewport({ x: 0, y: 0, width: 100, height: 100 })).toHaveLength(1);
		// each object is queryable by a point at its center (last object index 99)
		expect(store.queryPoint({ x: 99 * 200 + 25, y: 99 * 200 + 25 }, 10).length).toBeGreaterThan(0);
	});

	it('toJSON returns z-sorted serializable objects', () => {
		const store = new ObjectStore();
		const a = createShape(0, 0, 10, 10, 'rect');
		const b = createText(0, 0, 'hello');
		store.add(a);
		store.add(b);
		const json = JSON.parse(JSON.stringify(store.toJSON()));
		expect(json).toHaveLength(2);
		expect(json[0].type).toBe('shape');
		expect(json[1].type).toBe('text');
	});
});
