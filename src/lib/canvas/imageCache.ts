// imageCache — decoded image cache with LRU eviction and low-zoom bitmaps (M3-03).
//
// HTML images are decoded once into ImageBitmap (faster drawImage), and a
// reduced-resolution bitmap is built lazily for zoom < LOD_ZOOM (M3-04).
import { LOD_ZOOM, reducedSize } from '$lib/canvas/lod';

interface ImageEntry {
	key: string;
	image: HTMLImageElement;
	ready: boolean;
	bitmap: ImageBitmap | null;
	reduced: ImageBitmap | null;
	decoding: boolean;
	reducing: boolean;
	reducedWanted: boolean;
	bytes: number;
}

export interface ImageCacheDeps {
	/** test seam: build the HTMLImageElement for a src */
	load?: (src: string) => HTMLImageElement;
	decode?: (source: CanvasImageSource) => Promise<ImageBitmap>;
	resize?: (source: CanvasImageSource, width: number, height: number) => Promise<ImageBitmap>;
	/** called when a decoded/reduced bitmap is ready (renderer repaint) */
	onReady?: () => void;
	maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 192 * 1024 * 1024;

export class ImageCache {
	private entries = new Map<string, ImageEntry>();
	private maxBytes: number;

	constructor(private deps: ImageCacheDeps = {}) {
		this.maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
	}

	/**
	 * Sync source for the renderer. Full-resolution bitmap when available,
	 * reduced bitmap at low zoom (falling back to the still-loading image).
	 */
	getForZoom(src: string, zoom: number): CanvasImageSource | undefined {
		let entry = this.entries.get(src);
		if (!entry) {
			entry = this.create(src);
			if (!entry) return undefined;
		}
		this.touch(entry);

		if (zoom < LOD_ZOOM) {
			entry.reducedWanted = true;
			if (entry.reduced) return entry.reduced;
			if (entry.bitmap) {
				this.startReduce(entry);
				return entry.bitmap;
			}
			if (entry.ready) this.startDecode(entry);
			return entry.image;
		}
		if (entry.bitmap) return entry.bitmap;
		if (entry.ready) this.startDecode(entry);
		return entry.image;
	}

	size(): number {
		return this.entries.size;
	}

	bytes(): number {
		let total = 0;
		for (const entry of this.entries.values()) total += entry.bytes;
		return total;
	}

	clear(): void {
		for (const entry of this.entries.values()) this.dispose(entry);
		this.entries.clear();
	}

	private create(src: string): ImageEntry | undefined {
		if (typeof document === 'undefined' && !this.deps.load) return undefined;
		const image = this.deps.load ? this.deps.load(src) : new Image();
		const entry: ImageEntry = {
			key: src,
			image,
			ready: false,
			bitmap: null,
			reduced: null,
			decoding: false,
			reducing: false,
			reducedWanted: false,
			bytes: 0
		};
		this.entries.set(src, entry);
		image.onload = () => {
			entry.ready = true;
			const width = image.naturalWidth || image.width || 0;
			const height = image.naturalHeight || image.height || 0;
			entry.bytes += width * height * 4;
			this.enforce();
			this.startDecode(entry);
			this.deps.onReady?.();
		};
		image.onerror = () => {};
		image.src = src;
		this.enforce();
		return entry;
	}

	private startDecode(entry: ImageEntry): void {
		if (entry.decoding || entry.bitmap || entry.reduced) return;
		entry.decoding = true;
		const decode = this.deps.decode ?? ((source: CanvasImageSource) => createImageBitmap(source));
		void decode(entry.image)
			.then((bitmap) => {
				entry.bitmap = bitmap;
				entry.decoding = false;
				entry.bytes += bitmap.width * bitmap.height * 4;
				this.enforce();
				this.deps.onReady?.();
				if (entry.reducedWanted) this.startReduce(entry);
			})
			.catch(() => {
				entry.decoding = false;
			});
	}

	private startReduce(entry: ImageEntry): void {
		if (entry.reducing || entry.reduced) return;
		entry.reducing = true;
		const width = entry.image.naturalWidth || entry.image.width || 1;
		const height = entry.image.naturalHeight || entry.image.height || 1;
		const target = reducedSize(width, height);
		const resize =
			this.deps.resize ??
			((source: CanvasImageSource, w: number, h: number) =>
				createImageBitmap(source, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' }));
		void resize(entry.bitmap ?? entry.image, target.width, target.height)
			.then((bitmap) => {
				entry.reduced = bitmap;
				entry.reducing = false;
				entry.bytes += bitmap.width * bitmap.height * 4;
				this.enforce();
				this.deps.onReady?.();
			})
			.catch(() => {
				entry.reducing = false;
			});
	}

	/** LRU: move the entry to the most-recent end of the Map. */
	private touch(entry: ImageEntry): void {
		this.entries.delete(entry.key);
		this.entries.set(entry.key, entry);
	}

	private enforce(): void {
		let total = 0;
		for (const entry of this.entries.values()) total += entry.bytes;
		while (total > this.maxBytes && this.entries.size > 1) {
			const oldestKey = this.entries.keys().next().value;
			if (oldestKey === undefined) break;
			const entry = this.entries.get(oldestKey);
			if (!entry) break;
			total -= entry.bytes;
			this.dispose(entry);
			this.entries.delete(oldestKey);
		}
	}

	private dispose(entry: ImageEntry): void {
		entry.bitmap?.close?.();
		entry.reduced?.close?.();
		entry.bitmap = null;
		entry.reduced = null;
	}
}
