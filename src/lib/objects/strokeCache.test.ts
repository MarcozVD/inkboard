import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStrokeCache, strokeCacheSize, strokeOutlinePath } from './strokeCache';
import { createStroke } from '$lib/objects/factory';
import type { StrokeObject } from '$lib/objects/types';

class FakePath2D {
	ops: string[] = [];
	moveTo(): void {
		this.ops.push('move');
	}
	lineTo(): void {
		this.ops.push('line');
	}
	closePath(): void {
		this.ops.push('close');
	}
}

function makeStroke(points: number[], updatedAt = 1000): StrokeObject {
	const stroke = createStroke(points, { width: 4 });
	stroke.updatedAt = updatedAt;
	return stroke;
}

const POINTS = [0, 0, 0.5, 10, 10, 0.5, 20, 5, 0.5, 30, 15, 0.5];

describe('strokeCache (M3-02)', () => {
	beforeEach(() => {
		clearStrokeCache();
		vi.stubGlobal('Path2D', FakePath2D);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reuses the cached path while the stroke is unchanged', () => {
		const stroke = makeStroke(POINTS);
		const first = strokeOutlinePath(stroke);
		const second = strokeOutlinePath(stroke);
		expect(first).not.toBeNull();
		expect(second).toBe(first);
		expect(strokeCacheSize()).toBe(1);
		// the path is actually built (moveTo + lineTo + closePath)
		expect((first as unknown as FakePath2D).ops).toContain('close');
	});

	it('invalidates when updatedAt changes', () => {
		const stroke = makeStroke(POINTS, 1000);
		const first = strokeOutlinePath(stroke);
		stroke.updatedAt = 2000;
		const second = strokeOutlinePath(stroke);
		expect(second).not.toBe(first);
		expect(strokeCacheSize()).toBe(1);
	});

	it('invalidates when points move even with the same updatedAt', () => {
		const stroke = makeStroke(POINTS, 1000);
		const first = strokeOutlinePath(stroke);
		for (let i = 0; i < stroke.points.length; i++) stroke.points[i] += 25;
		const second = strokeOutlinePath(stroke);
		expect(second).not.toBe(first);
	});

	it('invalidates while a live stroke grows', () => {
		const stroke = makeStroke(POINTS, 1000);
		const first = strokeOutlinePath(stroke);
		stroke.points.push(40, 20, 0.5);
		const second = strokeOutlinePath(stroke);
		expect(second).not.toBe(first);
	});

	it('keeps independent entries per stroke id', () => {
		const a = makeStroke(POINTS);
		const b = makeStroke(POINTS);
		expect(b.id).not.toBe(a.id);
		expect(strokeOutlinePath(b)).not.toBe(strokeOutlinePath(a));
		expect(strokeCacheSize()).toBe(2);
	});

	it('returns null (and caches nothing) for undrawable strokes', () => {
		const tiny = makeStroke([0, 0, 0.5]);
		expect(strokeOutlinePath(tiny)).toBeNull();
		expect(strokeCacheSize()).toBe(0);
	});

	it('uses the pre-computed outline when present', () => {
		const stroke = makeStroke(POINTS);
		stroke.smoothedPoints = [0, 0, 10, 0, 10, 10, 0, 10];
		const path = strokeOutlinePath(stroke);
		expect(path).not.toBeNull();
		expect((path as unknown as FakePath2D).ops).toEqual(['move', 'line', 'line', 'line', 'close']);
	});

	it('clearStrokeCache drops every entry', () => {
		strokeOutlinePath(makeStroke(POINTS));
		expect(strokeCacheSize()).toBe(1);
		clearStrokeCache();
		expect(strokeCacheSize()).toBe(0);
	});
});
