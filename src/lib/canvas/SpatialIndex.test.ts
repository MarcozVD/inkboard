import { describe, expect, it } from 'vitest';
import { SpatialIndex } from './SpatialIndex';

describe('SpatialIndex', () => {
	it('inserts and queries viewport', () => {
		const idx = new SpatialIndex();
		idx.insert('a', { x: 0, y: 0, width: 10, height: 10 });
		idx.insert('b', { x: 100, y: 100, width: 10, height: 10 });

		expect(idx.queryViewport({ x: -5, y: -5, width: 20, height: 20 })).toEqual(['a']);
		expect(idx.queryViewport({ x: 95, y: 95, width: 20, height: 20 })).toEqual(['b']);
		// viewport covering both
		expect(idx.queryViewport({ x: -5, y: -5, width: 200, height: 200 }).sort()).toEqual(['a', 'b']);
	});

	it('removes objects', () => {
		const idx = new SpatialIndex();
		idx.insert('a', { x: 0, y: 0, width: 10, height: 10 });
		idx.remove('a', { x: 0, y: 0, width: 10, height: 10 });
		expect(idx.queryViewport({ x: -5, y: -5, width: 100, height: 100 })).toEqual([]);
		expect(idx.all()).toEqual([]);
	});

	it('updates bounds (move object)', () => {
		const idx = new SpatialIndex();
		const old = { x: 0, y: 0, width: 10, height: 10 };
		idx.insert('a', old);
		expect(idx.queryPoint({ x: 5, y: 5 })).toEqual(['a']);

		const moved = { x: 500, y: 500, width: 10, height: 10 };
		idx.update('a', old, moved);
		expect(idx.queryPoint({ x: 5, y: 5 })).toEqual([]);
		expect(idx.queryPoint({ x: 505, y: 505 })).toEqual(['a']);
	});

	it('queryPoint with padding catches near misses', () => {
		const idx = new SpatialIndex();
		idx.insert('a', { x: 0, y: 0, width: 10, height: 10 });
		expect(idx.queryPoint({ x: 11, y: 11 })).toEqual([]);
		expect(idx.queryPoint({ x: 11, y: 11 }, 2)).toEqual(['a']);
	});

	it('queryRect returns objects intersecting the rect', () => {
		const idx = new SpatialIndex();
		idx.insert('a', { x: 0, y: 0, width: 10, height: 10 });
		idx.insert('b', { x: 30, y: 30, width: 10, height: 10 });
		expect(idx.queryRect({ x: 8, y: 8, width: 10, height: 10 })).toEqual(['a']);
		expect(idx.queryRect({ x: 0, y: 0, width: 50, height: 50 }).sort()).toEqual(['a', 'b']);
	});

	it('clear empties the tree', () => {
		const idx = new SpatialIndex();
		idx.insert('a', { x: 0, y: 0, width: 10, height: 10 });
		idx.clear();
		expect(idx.all()).toEqual([]);
	});
});
