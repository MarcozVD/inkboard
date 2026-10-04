import { beforeEach, describe, expect, it } from 'vitest';
import { clearTextLayoutCache, textLayoutCacheSize, wrapText } from './textLayout';

const STYLE = { fontFamily: 'Test', fontSize: 16, lineHeight: 1.3, padding: 4 };

describe('wrapText cache (M3-03)', () => {
	beforeEach(() => {
		clearTextLayoutCache();
	});

	it('returns the cached array for the same content, width and font', () => {
		const first = wrapText('hello world cache', 80, STYLE);
		const second = wrapText('hello world cache', 80, STYLE);
		expect(second).toBe(first);
		expect(textLayoutCacheSize()).toBe(1);
	});

	it('misses when the width, content or font size changes', () => {
		const base = wrapText('hello world cache', 80, STYLE);
		expect(wrapText('hello world cache', 120, STYLE)).not.toBe(base);
		expect(wrapText('other content cache', 80, STYLE)).not.toBe(base);
		expect(wrapText('hello world cache', 80, { ...STYLE, fontSize: 20 })).not.toBe(base);
		expect(textLayoutCacheSize()).toBe(4);
	});

	it('clearTextLayoutCache drops every entry', () => {
		wrapText('hello world cache', 80, STYLE);
		expect(textLayoutCacheSize()).toBe(1);
		clearTextLayoutCache();
		expect(textLayoutCacheSize()).toBe(0);
	});
});
