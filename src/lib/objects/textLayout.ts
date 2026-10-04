// textLayout — text measuring, wrapping and box fitting (§M1-08).
// Measurement uses ctx.measureText with a width cache; falls back to the
// classic 0.6 × fontSize heuristic when no canvas context is available.
import type { TextStyle } from '$lib/objects/types';

type MeasurableStyle = {
	fontFamily: string;
	fontSize: number;
	fontWeight?: string;
	fontStyle?: string;
	lineHeight?: number;
	padding?: number;
};

let measuringCtx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();
/** Wrap results are stable per (font, width, content) — cache them (M3-03). */
const wrapCache = new Map<string, string[]>();
const WRAP_CACHE_MAX = 4000;

function getMeasuringContext(): CanvasRenderingContext2D | null {
	if (measuringCtx !== undefined) return measuringCtx;
	if (typeof document === 'undefined') {
		measuringCtx = null;
		return null;
	}
	measuringCtx = document.createElement('canvas').getContext('2d');
	return measuringCtx;
}

/** CSS font string — same as the renderer and the TextEditor overlay. */
export function fontString(style: Pick<TextStyle, 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle'>): string {
	return `${style.fontStyle === 'italic' ? 'italic ' : ''}${style.fontWeight === 'bold' ? 'bold ' : ''}${style.fontSize}px ${style.fontFamily}`;
}

/** Measured (and cached) width of a single line. */
export function measureText(text: string, style: MeasurableStyle): number {
	if (!text) return 0;
	const font = fontString(style as TextStyle);
	const key = `${font}|${text}`;
	const cached = widthCache.get(key);
	if (cached !== undefined) return cached;

	const ctx = getMeasuringContext();
	let width: number;
	if (ctx) {
		ctx.font = font;
		width = ctx.measureText(text).width;
	} else {
		width = text.length * style.fontSize * 0.6;
	}
	widthCache.set(key, width);
	return width;
}

/** Word-wrap `content` to `maxWidth` world px (keeps explicit newlines). */
export function wrapText(content: string, maxWidth: number, style: MeasurableStyle): string[] {
	const key = `${fontString(style as TextStyle)}|${maxWidth.toFixed(2)}|${content}`;
	const cached = wrapCache.get(key);
	if (cached) return cached;
	const lines = computeWrap(content, maxWidth, style);
	if (wrapCache.size >= WRAP_CACHE_MAX) {
		const oldest = wrapCache.keys().next().value;
		if (oldest !== undefined) wrapCache.delete(oldest);
	}
	wrapCache.set(key, lines);
	return lines;
}

function computeWrap(content: string, maxWidth: number, style: MeasurableStyle): string[] {
	const lines: string[] = [];
	for (const paragraph of content.split('\n')) {
		if (!paragraph || maxWidth <= 0) {
			lines.push(paragraph);
			continue;
		}
		let current = '';
		for (const word of paragraph.split(' ')) {
			const candidate = current ? `${current} ${word}` : word;
			if (current && measureText(candidate, style) > maxWidth) {
				lines.push(current);
				current = word;
			} else {
				current = candidate;
			}
		}
		lines.push(current);
	}
	return lines;
}

/** Drop the measurement + wrap caches (tests / hard resets). */
export function clearTextLayoutCache(): void {
	widthCache.clear();
	wrapCache.clear();
}

export function textLayoutCacheSize(): number {
	return wrapCache.size;
}

export interface TextLayout {
	lines: string[];
	width: number;
	height: number;
}

/** Layout of `content`, wrapping to `maxWidth` when given. */
export function layoutText(content: string, style: MeasurableStyle, maxWidth?: number): TextLayout {
	const lines = wrapText(content, maxWidth ?? 0, style);
	const width = Math.max(0, ...lines.map((line) => measureText(line, style)));
	const height = lines.length * style.fontSize * (style.lineHeight ?? 1.3);
	return { lines, width, height };
}

/** Box that fits the content (with padding and the 40×30 minimums). */
export function fitBox(style: MeasurableStyle, content: string, maxWidth?: number): { width: number; height: number } {
	const pad = style.padding ?? 4;
	const layout = layoutText(content, style, maxWidth ? Math.max(1, maxWidth - pad * 2) : undefined);
	return {
		width: Math.max(40, layout.width + pad * 2),
		height: Math.max(30, layout.height + pad * 2)
	};
}
