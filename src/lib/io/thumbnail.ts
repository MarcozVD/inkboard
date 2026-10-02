// thumbnail — 320×200 offscreen render of the board content (M2-03).
import { renderObject } from '$lib/objects/renderers';
import { getObjectBounds } from '$lib/objects/bounds';
import type { CanvasObject } from '$lib/objects/types';
import type { ResolvedTheme } from '$lib/objects/colors';

export const THUMB_WIDTH = 320;
export const THUMB_HEIGHT = 200;
const PAD = 16;

/**
 * Render the board objects into a 320×200 PNG data URL, fitted and centered.
 * Returns null when there is nothing to render (or no DOM canvas available).
 */
export function renderThumbnail(
	objects: CanvasObject[],
	opts: { theme: ResolvedTheme; background: string; getImage?: (src: string) => HTMLImageElement | undefined }
): string | null {
	if (objects.length === 0 || typeof document === 'undefined') return null;

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const obj of objects) {
		const bounds = getObjectBounds(obj);
		minX = Math.min(minX, bounds.x);
		minY = Math.min(minY, bounds.y);
		maxX = Math.max(maxX, bounds.x + bounds.width);
		maxY = Math.max(maxY, bounds.y + bounds.height);
	}
	if (!isFinite(minX)) return null;

	const width = Math.max(1, maxX - minX);
	const height = Math.max(1, maxY - minY);
	const scale = Math.min((THUMB_WIDTH - PAD * 2) / width, (THUMB_HEIGHT - PAD * 2) / height, 4);
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;

	const canvas = document.createElement('canvas');
	canvas.width = THUMB_WIDTH;
	canvas.height = THUMB_HEIGHT;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.fillStyle = opts.background;
	ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
	ctx.save();
	ctx.translate(THUMB_WIDTH / 2, THUMB_HEIGHT / 2);
	ctx.scale(scale, scale);
	ctx.translate(-centerX, -centerY);
	for (const obj of objects) {
		renderObject(ctx, obj, { theme: opts.theme, getImage: opts.getImage });
	}
	ctx.restore();

	return canvas.toDataURL('image/png');
}
