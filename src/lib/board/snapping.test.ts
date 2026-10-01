import { describe, expect, it } from 'vitest';
import { constrainToAxis, snapAngle, snapOffset, snapValue } from './snapping';

describe('snapping', () => {
	it('constrains movement to the dominant axis with Shift', () => {
		expect(constrainToAxis(30, 10, true)).toEqual({ x: 30, y: 0 });
		expect(constrainToAxis(10, 30, true)).toEqual({ x: 0, y: 30 });
		expect(constrainToAxis(30, 10, false)).toEqual({ x: 30, y: 10 });
	});

	it('snaps values to the nearest grid line', () => {
		expect(snapValue(317, 32)).toBe(320);
		expect(snapValue(317.9, 32)).toBe(320);
		expect(snapValue(300, 32)).toBe(288);
		expect(snapValue(320, 32)).toBe(320);
		expect(snapValue(12, 0)).toBe(12);
	});

	it('computes the snap offset for a bounds origin', () => {
		expect(snapOffset(317, 192, 32)).toEqual({ x: 3, y: 0 });
		expect(snapOffset(326, 200, 32)).toEqual({ x: -6, y: -8 });
	});

	it('rounds rotation to 15° steps with Shift', () => {
		const step = Math.PI / 12;
		expect(snapAngle(0.6, step)).toBeCloseTo(2 * step); // ~34° → 30°
		expect(snapAngle(1.1, step)).toBeCloseTo(4 * step); // ~63° → 60°
		expect(snapAngle(-0.4, step)).toBeCloseTo(-2 * step); // −23° → −30°
		expect(snapAngle(0.1, step)).toBe(0);
	});
});
