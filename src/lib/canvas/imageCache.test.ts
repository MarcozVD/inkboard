import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageCache } from './imageCache';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

class FakeImage {
	naturalWidth: number;
	naturalHeight: number;
	width: number;
	height: number;
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	closed = false;
	constructor(naturalWidth: number, naturalHeight: number) {
		this.naturalWidth = naturalWidth;
		this.naturalHeight = naturalHeight;
		this.width = naturalWidth;
		this.height = naturalHeight;
	}
	set src(_value: string) {
		queueMicrotask(() => this.onload?.());
	}
}

class FakeBitmap {
	closed = false;
	constructor(
		public width: number,
		public height: number
	) {}
	close(): void {
		this.closed = true;
	}
}

function makeCache(maxBytes = 1024 * 1024 * 1024) {
	const loads: string[] = [];
	const decodes: string[] = [];
	const resizes: string[] = [];
	const cache = new ImageCache({
		load: (src) => {
			loads.push(src);
			return new FakeImage(1024, 512) as unknown as HTMLImageElement;
		},
		decode: async (source) => {
			decodes.push('decode');
			const image = source as unknown as FakeImage;
			return new FakeBitmap(image.naturalWidth, image.naturalHeight) as unknown as ImageBitmap;
		},
		resize: async (_source, width, height) => {
			resizes.push(`${width}x${height}`);
			return new FakeBitmap(width, height) as unknown as ImageBitmap;
		},
		onReady: () => {},
		maxBytes
	});
	return { cache, loads, decodes, resizes };
}

describe('ImageCache (M3-03/M3-04)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('loads each src once and serves the decoded bitmap when ready', async () => {
		const { cache, loads, decodes } = makeCache();
		const first = cache.getForZoom('a.png', 1);
		expect(first).toBeDefined(); // HTMLImageElement while decoding
		expect(loads).toEqual(['a.png']);
		await flush();
		const second = cache.getForZoom('a.png', 1);
		expect(second).toBeInstanceOf(FakeBitmap);
		expect(decodes).toHaveLength(1);
		cache.clear();
	});

	it('builds and reuses a reduced bitmap at low zoom', async () => {
		const { cache, resizes } = makeCache();
		cache.getForZoom('big.png', 1);
		await flush();
		cache.getForZoom('big.png', 0.1);
		await flush();
		expect(resizes).toEqual(['256x128']);
		const reduced = cache.getForZoom('big.png', 0.1);
		expect((reduced as unknown as FakeBitmap).width).toBe(256);
		expect(resizes).toHaveLength(1);
		cache.clear();
	});

	it('evicts least-recently-used entries when over the byte budget', async () => {
		// each entry ≈ 2MB (image) + 2MB (bitmap) = 4MB
		const { cache } = makeCache(5 * 1024 * 1024);
		cache.getForZoom('a.png', 1);
		await flush();
		expect(cache.size()).toBe(1);
		cache.getForZoom('b.png', 1);
		await flush();
		expect(cache.size()).toBe(1); // a evicted
		// touching a previously loaded src keeps it alive
		cache.getForZoom('b.png', 1);
		cache.getForZoom('c.png', 1);
		await flush();
		expect(cache.size()).toBeLessThanOrEqual(2);
		cache.clear();
		expect(cache.size()).toBe(0);
	});

	it('returns undefined when neither document nor loader is available', () => {
		const cache = new ImageCache({ load: undefined });
		expect(cache.getForZoom('a.png', 1)).toBeUndefined();
	});
});
