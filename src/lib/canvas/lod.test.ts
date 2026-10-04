import { describe, expect, it } from 'vitest';
import { TEXT_BAR_PX, isLowDetail, reducedSize, textAsBars, LOD_ZOOM } from './lod';

describe('lod thresholds (M3-04)', () => {
	it('switches to low detail only below the zoom threshold', () => {
		expect(isLowDetail(LOD_ZOOM)).toBe(false);
		expect(isLowDetail(1)).toBe(false);
		expect(isLowDetail(0.249)).toBe(true);
		expect(isLowDetail(0.05)).toBe(true);
	});

	it('turns text into bars under 3 screen px', () => {
		expect(textAsBars(16, 0.2)).toBe(false); // 3.2px
		expect(textAsBars(16, 0.18)).toBe(true); // 2.88px
		expect(textAsBars(16, 0.25)).toBe(false); // 4px
		expect(textAsBars(12, 1)).toBe(false);
		expect(textAsBars(12, TEXT_BAR_PX / 12 - 0.01)).toBe(true);
	});

	it('computes reduced bitmap sizes while preserving aspect ratio', () => {
		expect(reducedSize(1024, 512)).toEqual({ width: 256, height: 128 });
		expect(reducedSize(512, 1024)).toEqual({ width: 128, height: 256 });
		expect(reducedSize(64, 32)).toEqual({ width: 64, height: 32 }); // never upscale
		expect(reducedSize(1, 1)).toEqual({ width: 1, height: 1 });
	});
});
