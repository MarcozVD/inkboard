import { describe, expect, it } from 'vitest';
import { fitBox, fontString, layoutText, measureText, wrapText } from './textLayout';

const STYLE = {
	fontFamily: 'Segoe UI, sans-serif',
	fontSize: 10,
	fontWeight: 'normal',
	fontStyle: 'normal',
	lineHeight: 2,
	padding: 4
} as const;

describe('textLayout', () => {
	it('measures with the 0.6×fontSize fallback when no canvas is available', () => {
		expect(measureText('abcd', STYLE)).toBeCloseTo(4 * 10 * 0.6);
		expect(measureText('', STYLE)).toBe(0);
	});

	it('builds the same font string as the renderer', () => {
		expect(fontString(STYLE)).toBe('10px Segoe UI, sans-serif');
		expect(fontString({ ...STYLE, fontWeight: 'bold', fontStyle: 'italic' })).toBe(
			'italic bold 10px Segoe UI, sans-serif'
		);
	});

	it('wraps words to the given width', () => {
		const lines = wrapText('aaaa bbbb cccc', 30, STYLE); // each word is 24 wide
		expect(lines).toEqual(['aaaa', 'bbbb', 'cccc']);
		// a wide enough line keeps the words together
		expect(wrapText('aaaa bbbb cccc', 60, STYLE)).toEqual(['aaaa bbbb', 'cccc']);
	});

	it('keeps explicit newlines and empty lines', () => {
		expect(wrapText('a\n\nb', 100, STYLE)).toEqual(['a', '', 'b']);
	});

	it('computes height from the wrapped line count', () => {
		const layout = layoutText('aaaa bbbb cccc', STYLE, 30);
		expect(layout.lines).toHaveLength(3);
		expect(layout.width).toBeCloseTo(4 * 10 * 0.6);
		expect(layout.height).toBeCloseTo(3 * 10 * 2);
	});

	it('fits the box with padding and minimums', () => {
		const box = fitBox(STYLE, 'abcdefgh');
		expect(box.width).toBeCloseTo(8 * 10 * 0.6 + 8); // 56, above the 40 minimum
		expect(box.height).toBe(30); // one line (28) is below the 30 minimum
		const two = fitBox(STYLE, 'abcdefgh\nijklmnop');
		expect(two.height).toBeCloseTo(2 * 10 * 2 + 8);
		expect(fitBox(STYLE, '').width).toBe(40);
		expect(fitBox(STYLE, '').height).toBe(30);
	});
});
