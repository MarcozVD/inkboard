// SvgExporter — serialize board objects to an SVG string (§18, M2-10).
// Mirrors the canvas renderer: center-based rotation, local object coords,
// perfect-freehand stroke outlines, wrapped text and arrow heads.
import type { CanvasObject, ConnectorObject, ShapeObject, StickyNoteObject, TextObject } from '$lib/objects/types';
import { getObjectBounds } from '$lib/objects/bounds';
import { resolveColor, type ResolvedTheme } from '$lib/objects/colors';
import { wrapText } from '$lib/objects/textLayout';
import { strokeOutlineFlat } from '$lib/objects/strokeCache';
import type { ExportRegion } from '$lib/io/exportRegion';

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Export a full board (objects in world coords) to an SVG string. */
export function boardToSvg(
	objects: CanvasObject[],
	opts: {
		width?: number;
		height?: number;
		/** explicit world region (M2-09: board/selection/viewport exports) */
		region?: ExportRegion | null;
		background?: string;
		theme?: ResolvedTheme;
	} = {}
): string {
	let viewX: number;
	let viewY: number;
	let viewW: number;
	let viewH: number;
	let width: number;
	let height: number;

	if (opts.region) {
		viewX = opts.region.minX;
		viewY = opts.region.minY;
		viewW = opts.region.width;
		viewH = opts.region.height;
		width = opts.width ?? Math.round(viewW);
		height = opts.height ?? Math.round(viewH);
	} else {
		// compute bounds over all objects (rotated AABBs)
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const o of objects) {
			const b = getObjectBounds(o);
			minX = Math.min(minX, b.x);
			minY = Math.min(minY, b.y);
			maxX = Math.max(maxX, b.x + b.width);
			maxY = Math.max(maxY, b.y + b.height);
		}
		if (!isFinite(minX)) {
			minX = 0;
			minY = 0;
			maxX = opts.width ?? 1200;
			maxY = opts.height ?? 800;
		}
		const pad = 20;
		viewX = minX - pad;
		viewY = minY - pad;
		viewW = opts.width ?? Math.ceil(maxX - minX + 40);
		viewH = opts.height ?? Math.ceil(maxY - minY + 40);
		width = viewW;
		height = viewH;
	}

	const parts: string[] = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
			`viewBox="${viewX} ${viewY} ${viewW} ${viewH}" ` +
			`font-family="Segoe UI, sans-serif">`
	);
	if (opts.background) {
		parts.push(`<rect x="${viewX}" y="${viewY}" width="${viewW}" height="${viewH}" fill="${opts.background}"/>`);
	}
	for (const o of objects) {
		parts.push(objectToSvg(o, opts.theme ?? 'dark'));
	}
	parts.push('</svg>');
	return parts.join('\n');
}

/** Trimmed number for compact SVG output. */
function num(value: number): string {
	if (!Number.isFinite(value)) return '0';
	return String(Math.round(value * 100) / 100);
}

/** Same transform the canvas applies: center → rotate → scale → local box. */
function objectTransform(o: CanvasObject): string {
	const t = o.transform;
	const width = Math.abs(t.width);
	const height = Math.abs(t.height);
	const cx = t.x + t.width / 2;
	const cy = t.y + t.height / 2;
	const parts = [`translate(${num(cx)} ${num(cy)})`];
	if (t.rotation) parts.push(`rotate(${num((t.rotation * 180) / Math.PI)})`);
	if ((t.scaleX ?? 1) !== 1 || (t.scaleY ?? 1) !== 1) {
		parts.push(`scale(${num(t.scaleX ?? 1)} ${num(t.scaleY ?? 1)})`);
	}
	parts.push(`translate(${num(-width / 2)} ${num(-height / 2)})`);
	return parts.join(' ');
}

function pointsAttr(points: { x: number; y: number }[]): string {
	return points.map((p) => `${num(p.x)},${num(p.y)}`).join(' ');
}

function starPoints(cx: number, cy: number, r: number, points: number, innerRatio: number) {
	const out: { x: number; y: number }[] = [];
	for (let i = 0; i < points * 2; i++) {
		const radius = i % 2 === 0 ? r : r * innerRatio;
		const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
		out.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
	}
	return out;
}

function polygonPoints(cx: number, cy: number, r: number, sides: number) {
	const out: { x: number; y: number }[] = [];
	for (let i = 0; i < sides; i++) {
		const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
		out.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
	}
	return out;
}

/** Arrow head polygon matching `drawArrowHead` (local coords, tip at w,h). */
function arrowHeadPoints(w: number, h: number, strokeWidth: number) {
	const angle = Math.atan2(h, w);
	const headLen = Math.max(10, strokeWidth * 4);
	const tipX = w;
	const tipY = h;
	return [
		{ x: tipX, y: tipY },
		{ x: tipX - headLen * Math.cos(angle - Math.PI / 6), y: tipY - headLen * Math.sin(angle - Math.PI / 6) },
		{ x: tipX - headLen * Math.cos(angle + Math.PI / 6), y: tipY - headLen * Math.sin(angle + Math.PI / 6) }
	];
}

function shapeBody(shape: ShapeObject, theme: ResolvedTheme): string {
	const sw = Math.abs(shape.transform.width);
	const sh = Math.abs(shape.transform.height);
	const s = shape.style;
	const fill = s.fill === 'none' ? 'none' : resolveColor(s.fill, theme);
	const stroke = resolveColor(s.stroke, theme);
	const opacity = s.opacity ?? 1;
	const dash = s.strokeDash?.length ? ` stroke-dasharray="${s.strokeDash.join(' ')}"` : '';
	const paint = `fill="${fill}" stroke="${stroke}" stroke-width="${num(s.strokeWidth || 1)}" opacity="${num(opacity)}"${dash}`;
	const strokePaint = `stroke="${stroke}" stroke-width="${num(s.strokeWidth || 1)}" opacity="${num(opacity)}"${dash}`;
	switch (shape.shape) {
		case 'rect':
			return `<rect width="${num(sw)}" height="${num(sh)}" rx="${num(Math.min(s.cornerRadius ?? 0, sw / 2, sh / 2))}" ${paint}/>`;
		case 'ellipse':
			return `<ellipse cx="${num(sw / 2)}" cy="${num(sh / 2)}" rx="${num(sw / 2)}" ry="${num(sh / 2)}" ${paint}/>`;
		case 'line':
			return `<line x1="0" y1="0" x2="${num(sw)}" y2="${num(sh)}" fill="none" ${strokePaint} stroke-linecap="round"/>`;
		case 'arrow':
			return (
				`<line x1="0" y1="0" x2="${num(sw)}" y2="${num(sh)}" fill="none" ${strokePaint} stroke-linecap="round"/>` +
				`<polygon points="${pointsAttr(arrowHeadPoints(sw, sh, s.strokeWidth || 1))}" fill="${stroke}" opacity="${num(opacity)}"/>`
			);
		case 'triangle':
			return `<polygon points="${pointsAttr([
				{ x: sw / 2, y: 0 },
				{ x: sw, y: sh },
				{ x: 0, y: sh }
			])}" ${paint}/>`;
		case 'diamond':
			return `<polygon points="${pointsAttr([
				{ x: sw / 2, y: 0 },
				{ x: sw, y: sh / 2 },
				{ x: sw / 2, y: sh },
				{ x: 0, y: sh / 2 }
			])}" ${paint}/>`;
		case 'star':
			return `<polygon points="${pointsAttr(starPoints(sw / 2, sh / 2, Math.min(sw, sh) / 2, shape.sides ?? 5, shape.innerRadius ?? 0.5))}" ${paint}/>`;
		case 'polygon':
			return `<polygon points="${pointsAttr(polygonPoints(sw / 2, sh / 2, Math.min(sw, sh) / 2, shape.sides ?? 6))}" ${paint}/>`;
		default:
			return `<rect width="${num(sw)}" height="${num(sh)}" ${paint}/>`;
	}
}

function textBody(text: TextObject, theme: ResolvedTheme): string {
	const t = text.transform;
	const width = Math.abs(t.width);
	const style = text.style;
	const padding = style.padding ?? 0;
	const lines = wrapText(text.content, width - padding * 2, style);
	const lineHeight = style.fontSize * (style.lineHeight ?? 1.3);
	const anchor = style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start';
	const x = style.textAlign === 'center' ? width / 2 : style.textAlign === 'right' ? width : 0;
	const font =
		`font-size="${num(style.fontSize)}" font-family="${esc(style.fontFamily)}" ` +
		`${style.fontWeight === 'bold' ? 'font-weight="bold" ' : ''}` +
		`${style.fontStyle === 'italic' ? 'font-style="italic" ' : ''}`;
	const body = lines
		.map(
			(line, i) =>
				`<text x="${num(x)}" y="${num(i * lineHeight + style.fontSize * 0.8)}" text-anchor="${anchor}" ${font}` +
				`fill="${resolveColor(style.color, theme)}">${esc(line)}</text>`
		)
		.join('');
	const background = style.backgroundColor
		? `<rect x="${num(-padding)}" y="${num(-padding)}" width="${num(width + padding * 2)}" height="${num(Math.abs(t.height) + padding * 2)}" fill="${resolveColor(style.backgroundColor, theme)}"/>`
		: '';
	return `<g transform="${objectTransform(text)}" opacity="${num(style.opacity ?? 1)}">${background}${body}</g>`;
}

function stickyBody(note: StickyNoteObject): string {
	const t = note.transform;
	const style = note.style;
	const width = Math.abs(t.width);
	const height = Math.abs(t.height);
	const padding = style.padding ?? 12;
	const lines = wrapText(note.content, width - padding * 2, { ...style, lineHeight: 1.3 });
	const lineHeight = style.fontSize * 1.3;
	const body = lines
		.map(
			(line, i) =>
				`<text x="${num(padding)}" y="${num(padding + i * lineHeight + style.fontSize * 0.8)}" ` +
				`font-size="${num(style.fontSize)}" font-family="${esc(style.fontFamily)}" fill="${style.textColor}">${esc(line)}</text>`
		)
		.join('');
	return (
		`<g transform="${objectTransform(note)}" opacity="${num(style.opacity ?? 1)}">` +
		`<rect width="${num(width)}" height="${num(height)}" rx="4" fill="${style.backgroundColor}" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>` +
		`<polygon points="${num(width - 14)},0 ${num(width)},14 ${num(width)},0" fill="rgba(0,0,0,0.08)"/>` +
		`${body}</g>`
	);
}

function connectorEnd(
	style: ConnectorObject['style'],
	color: string,
	tip: { x: number; y: number },
	from: { x: number; y: number },
	arrow: 'none' | 'arrow' | 'dot'
): string {
	if (arrow === 'none') return '';
	const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
	if (arrow === 'dot') {
		return `<circle cx="${num(tip.x)}" cy="${num(tip.y)}" r="${num((style.strokeWidth || 2) * 1.6)}" fill="${color}"/>`;
	}
	const headLen = 12;
	return `<polygon points="${pointsAttr([
		tip,
		{ x: tip.x - headLen * Math.cos(angle - Math.PI / 6), y: tip.y - headLen * Math.sin(angle - Math.PI / 6) },
		{ x: tip.x - headLen * Math.cos(angle + Math.PI / 6), y: tip.y - headLen * Math.sin(angle + Math.PI / 6) }
	])}" fill="${color}"/>`;
}

function objectToSvg(o: CanvasObject, theme: ResolvedTheme): string {
	const opacity = o.style?.opacity ?? 1;

	switch (o.type) {
		case 'shape':
			return `<g opacity="${num(opacity)}" transform="${objectTransform(o)}">${shapeBody(o, theme)}</g>`;
		case 'text':
			return textBody(o, theme);
		case 'sticky_note':
			return stickyBody(o);
		case 'stroke': {
			const outline = strokeOutlineFlat(o);
			if (!outline || outline.length < 6) return '';
			const d =
				`M${num(outline[0])} ${num(outline[1])} ` +
				outline
					.slice(2)
					.reduce((acc, value, i) => (i % 2 === 0 ? `${acc}L${num(value)} ` : `${acc}${num(value)} `), '') +
				'Z';
			const alpha = (o.style.opacity ?? 1) * (o.style.isHighlighter ? 0.4 : 1);
			return `<path d="${d.trim()}" fill="${resolveColor(o.style.color, theme)}" opacity="${num(alpha)}"/>`;
		}
		case 'connector': {
			const waypoints = o.waypoints ?? [];
			const points = [o.startPoint, ...waypoints, o.endPoint];
			const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`).join(' ');
			const color = resolveColor(o.style.stroke, theme);
			const dash = o.style.strokeDash?.length ? ` stroke-dasharray="${o.style.strokeDash.join(' ')}"` : '';
			const first = waypoints[0] ?? o.endPoint;
			const last = waypoints.at(-1) ?? o.startPoint;
			return (
				`<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(o.style.strokeWidth || 2)}" ` +
				`stroke-linecap="round" opacity="${num(opacity)}"${dash}/>` +
				connectorEnd(o.style, color, o.endPoint, last, o.style.endArrow) +
				connectorEnd(o.style, color, o.startPoint, first, o.style.startArrow)
			);
		}
		case 'image':
			return (
				`<g opacity="${num(opacity)}" transform="${objectTransform(o)}">` +
				`<image href="${esc(o.src)}" width="${num(Math.abs(o.transform.width))}" height="${num(Math.abs(o.transform.height))}" preserveAspectRatio="none"/></g>`
			);
		case 'group':
		default:
			return '';
	}
}
