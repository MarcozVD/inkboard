// ImageExporter — render objects to an offscreen canvas → PNG/JPEG data URL
// (§18, M2-09). PNG supports transparent backgrounds; JPEG takes a quality.
import { renderObject } from '$lib/objects/renderers';
import { EXPORT_PAD, objectsBounds, type ExportRegion } from '$lib/io/exportRegion';
import type { CanvasObject } from '$lib/objects/types';
import type { ResolvedTheme } from '$lib/objects/colors';

export type ImageFormat = 'png' | 'jpeg';

export interface ImageExportOptions {
	format?: ImageFormat;
	scale?: number;
	/** JPEG quality 0..1 (default 0.9) */
	quality?: number;
	/** null = transparent; ignored for JPEG */
	background?: string | null;
	region?: ExportRegion | null;
	theme?: ResolvedTheme;
	getImage?: (src: string) => HTMLImageElement | undefined;
}

function fallbackRegion(objects: CanvasObject[]): ExportRegion {
	const bounds = objectsBounds(objects);
	if (!bounds) return { minX: 0, minY: 0, width: 1200, height: 800 };
	return {
		minX: bounds.minX - EXPORT_PAD,
		minY: bounds.minY - EXPORT_PAD,
		width: bounds.width + EXPORT_PAD * 2,
		height: bounds.height + EXPORT_PAD * 2
	};
}

/**
 * Render objects to a PNG/JPEG data URL at the given region and scale.
 * Works entirely offscreen (no DOM dependency beyond Image/Canvas).
 */
export async function boardToImageDataUrl(objects: CanvasObject[], opts: ImageExportOptions = {}): Promise<string> {
	const format = opts.format ?? 'png';
	const scale = opts.scale ?? 2;
	const region = opts.region ?? fallbackRegion(objects);
	const width = Math.max(1, Math.round(region.width * scale));
	const height = Math.max(1, Math.round(region.height * scale));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('image export: canvas 2d context unavailable');

	// transparency is PNG-only (JPEG has no alpha channel)
	const transparent = opts.background === null && format === 'png';
	if (!transparent) {
		ctx.fillStyle = opts.background ?? (opts.theme === 'light' ? '#f5f5f7' : '#0f1013');
		ctx.fillRect(0, 0, width, height);
	}

	// region world coords → export space
	ctx.save();
	ctx.scale(scale, scale);
	ctx.translate(-region.minX, -region.minY);
	for (const obj of objects) {
		renderObject(ctx, obj, { getImage: opts.getImage, theme: opts.theme });
	}
	ctx.restore();

	if (format === 'jpeg') {
		return canvas.toDataURL('image/jpeg', opts.quality ?? 0.9);
	}
	return canvas.toDataURL('image/png');
}

/** Backwards-compatible PNG helper (M0/M1 callers). */
export function boardToPngDataUrl(
	objects: CanvasObject[],
	opts: Omit<ImageExportOptions, 'format'> = {}
): Promise<string> {
	return boardToImageDataUrl(objects, { ...opts, format: 'png' });
}
