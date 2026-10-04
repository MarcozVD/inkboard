// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { STICKY_GRID, insertImportedStickies, stickyGridPositions } from './msWhiteboard';
import { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';

describe('stickyGridPositions (M2-11)', () => {
	it('centers the grid on the requested point', () => {
		const center = { x: 500, y: 400 };
		for (const count of [1, 3, 4, 7]) {
			const positions = stickyGridPositions(count, center);
			expect(positions).toHaveLength(count);
			const xs = positions.map((p) => p.x);
			const ys = positions.map((p) => p.y);
			const gridCenterX = (Math.min(...xs) + Math.max(...xs) + STICKY_GRID.width) / 2;
			const gridCenterY = (Math.min(...ys) + Math.max(...ys) + STICKY_GRID.height) / 2;
			expect(gridCenterX).toBeCloseTo(center.x);
			expect(gridCenterY).toBeCloseTo(center.y);
		}
	});

	it('uses at most four columns and never overlaps', () => {
		const positions = stickyGridPositions(9, { x: 0, y: 0 });
		const columns = new Set(positions.map((p) => p.x)).size;
		expect(columns).toBe(3);
		for (const a of positions) {
			for (const b of positions) {
				if (a === b) continue;
				const separated =
					a.x + STICKY_GRID.width <= b.x ||
					b.x + STICKY_GRID.width <= a.x ||
					a.y + STICKY_GRID.height <= b.y ||
					b.y + STICKY_GRID.height <= a.y;
				expect(separated).toBe(true);
			}
		}
		expect(stickyGridPositions(0)).toEqual([]);
	});
});

describe('insertImportedStickies (M2-11)', () => {
	function makeEngine() {
		return new CanvasEngine({ camera: () => DEFAULT_CAMERA, onDirty: () => {} });
	}

	it('inserts title + texts as stickies in one undo step', () => {
		const engine = makeEngine();
		const count = insertImportedStickies(engine, 'Board title', ['one', 'two'], { x: 100, y: 100 });

		expect(count).toBe(3);
		expect(engine.store.size()).toBe(3);
		const objects = engine.store.getAll();
		expect(objects.every((o) => o.type === 'sticky_note')).toBe(true);
		expect(objects.map((o) => (o.type === 'sticky_note' ? o.content : ''))).toEqual(['Board title', 'one', 'two']);

		// a single undo removes the whole import
		engine.history.undo();
		expect(engine.store.size()).toBe(0);
		engine.history.redo();
		expect(engine.store.size()).toBe(3);
	});

	it('ignores empty imports', () => {
		const engine = makeEngine();
		expect(insertImportedStickies(engine, null, [], { x: 0, y: 0 })).toBe(0);
		expect(insertImportedStickies(engine, undefined, ['  ', ''], { x: 0, y: 0 })).toBe(0);
		expect(engine.history.canUndo).toBe(false);
	});
});
