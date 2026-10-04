import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform';

describe('detectPlatform (M4-02)', () => {
	it('detects macOS from the user agent', () => {
		expect(
			detectPlatform(
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
				'MacIntel'
			)
		).toBe('macos');
	});

	it('detects Windows and Linux', () => {
		expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32')).toBe('windows');
		expect(detectPlatform('Mozilla/5.0 (X11; Ubuntu; Linux x86_64)', 'Linux x86_64')).toBe('linux');
	});

	it('falls back to other for unknown or empty probes', () => {
		expect(detectPlatform('', '')).toBe('other');
		expect(detectPlatform('SomeEmbeddedBrowser/1.0')).toBe('other');
	});
});
