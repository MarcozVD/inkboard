// PngExporter — render board objects to an offscreen canvas → PNG data URL (§18).
import { renderObject } from '$lib/objects/renderers';
import type { CanvasObject, GridConfig } from '$lib/objects/types';

interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

function computeBounds(objects: CanvasObject[]): Bounds | null {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const o of objects) {
		const t = o.transform;
		const x1 = t.x;
		const y1 = t.y;
		const x2 = t.x + (t.width ?? 0);
		const y2 = t.y + (t.height ?? 0);
		minX = Math.min(minX, x1, x2);
		minY = Math.min(minY, y1, y2);
		maxX = Math.max(maxX, x1, x2);
		maxY = Math.max(maxY, y1, y2);
	}
	if (!isFinite(minX)) return null;
	return { minX, minY, maxX, maxY };
}

/**
 * Render the board to a PNG data URL. Scale > 1 for hi-res export.
 * Works entirely off the main canvas (no DOM dependency beyond Image/Canvas).
 */
export async function boardToPngDataUrl(
	objects: CanvasObject[],
	opts: { scale?: number; background?: string; grid?: GridConfig; getImage?: (src: string) => HTMLImageElement | undefined } = {}
): Promise<string> {
	const scale = opts.scale ?? 2;
	const bounds = computeBounds(objects);
	if (!bounds) {
		// empty board — export an empty canvas
		const c = document.createElement('canvas');
		c.width = 1200 * scale;
		c.height = 800 * scale;
		return c.toDataURL('image/png');
	}

	const pad = 20;
	const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX + pad * 2) * scale));
	const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY + pad * 2) * scale));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('PNG export: canvas 2d context unavailable');

	ctx.fillStyle = opts.background ?? '#1e1f24';
	ctx.fillRect(0, 0, width, height);

	// world → export-space: translate by -min + pad, then scale
	ctx.save();
	ctx.scale(scale, scale);
	ctx.translate(pad - bounds.minX, pad - bounds.minY);

	for (const o of objects) {
		renderObject(ctx, o, { getImage: opts.getImage });
	}
	ctx.restore();

	return canvas.toDataURL('image/png');
}
