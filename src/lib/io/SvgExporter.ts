// SvgExporter — serialize board objects to an SVG string (§18).
import type { CanvasObject } from '$lib/objects/types';
import { getObjectBounds } from '$lib/objects/bounds';
import { resolveColor, type ResolvedTheme } from '$lib/objects/colors';
import type { ExportRegion } from '$lib/io/exportRegion';

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** SVG rotate() around the box center — same convention as the canvas (§M0-10). */
function rotationAttr(o: CanvasObject): string {
	const r = o.transform.rotation ?? 0;
	if (!r) return '';
	const cx = o.transform.x + o.transform.width / 2;
	const cy = o.transform.y + o.transform.height / 2;
	const deg = (r * 180) / Math.PI;
	return ` transform="rotate(${deg.toFixed(3)} ${cx.toFixed(2)} ${cy.toFixed(2)})"`;
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

function objectToSvg(o: CanvasObject, theme: ResolvedTheme): string {
	const t = o.transform;
	const opacity = o.style?.opacity ?? 1;

	switch (o.type) {
		case 'shape': {
			const w = t.width;
			const h = t.height;
			const s = o.style;
			const fill = s.fill === 'none' ? s.fill : resolveColor(s.fill, theme);
			const stroke = resolveColor(s.stroke, theme);
			const rot = rotationAttr(o);
			const common =
				`x="${t.x}" y="${t.y}" width="${w}" height="${h}" ` +
				`fill="${fill}" stroke="${stroke}" stroke-width="${s.strokeWidth ?? 1}" ` +
				`opacity="${opacity}" ${s.strokeDash?.length ? `stroke-dasharray="${s.strokeDash.join(' ')}"` : ''}`;
			switch (o.shape) {
				case 'rect':
					return `<rect ${common} rx="${s.cornerRadius ?? 0}"${rot}/>`;
				case 'ellipse':
					return (
						`<ellipse cx="${t.x + w / 2}" cy="${t.y + h / 2}" rx="${w / 2}" ry="${h / 2}" ` +
						`fill="${fill}" stroke="${stroke}" stroke-width="${s.strokeWidth ?? 1}" opacity="${opacity}"${rot}/>`
					);
				case 'line':
				case 'arrow':
					return (
						`<line x1="${t.x}" y1="${t.y}" x2="${t.x + w}" y2="${t.y + h}" ` +
						`stroke="${stroke}" stroke-width="${s.strokeWidth ?? 1}" opacity="${opacity}"${rot}/>`
					);
				case 'triangle':
					return (
						`<polygon points="${t.x + w / 2},${t.y} ${t.x + w},${t.y + h} ${t.x},${t.y + h}" ` +
						`fill="${fill}" stroke="${stroke}" stroke-width="${s.strokeWidth ?? 1}" opacity="${opacity}"${rot}/>`
					);
				case 'diamond':
					return (
						`<polygon points="${t.x + w / 2},${t.y} ${t.x + w},${t.y + h / 2} ${t.x + w / 2},${t.y + h} ${t.x},${t.y + h / 2}" ` +
						`fill="${fill}" stroke="${stroke}" stroke-width="${s.strokeWidth ?? 1}" opacity="${opacity}"${rot}/>`
					);
				default:
					return `<rect ${common}${rot}/>`;
			}
		}
		case 'text': {
			const lines = o.content.split('\n');
			const lh = o.style.fontSize * (o.style.lineHeight ?? 1.3);
			const body = lines
				.map(
					(line, i) =>
						`<text x="${t.x}" y="${t.y + o.style.fontSize + i * lh}" ` +
						`font-size="${o.style.fontSize}" fill="${resolveColor(o.style.color, theme)}" opacity="${opacity}">${esc(line)}</text>`
				)
				.join('\n');
			return `<g${rotationAttr(o)}>${body}</g>`;
		}
		case 'sticky_note': {
			return `<g opacity="${opacity}"${rotationAttr(o)}>
				<rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" rx="4" fill="${o.style.backgroundColor}"/>
				${o.content
					.split('\n')
					.map(
						(line, i) =>
							`<text x="${t.x + (o.style.padding ?? 12)}" y="${t.y + (o.style.padding ?? 12) + o.style.fontSize + i * o.style.fontSize * 1.3}" ` +
							`font-size="${o.style.fontSize}" fill="${o.style.textColor}">${esc(line)}</text>`
					)
					.join('\n')}
			</g>`;
		}
		case 'stroke': {
			const pts = o.points;
			if (pts.length < 4) return '';
			const d = pts.reduce((acc, _v, i) => {
				if (i % 3 === 0) {
					const x = pts[i];
					const y = pts[i + 1];
					acc += (acc === '' ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
				}
				return acc;
			}, '');
			return (
				`<path d="${d}" stroke="${resolveColor(o.style.color, theme)}" stroke-width="${o.style.width}" ` +
				`fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`
			);
		}
		case 'connector': {
			const pts = [o.startPoint, ...(o.waypoints ?? []), o.endPoint];
			const d = pts
				.map((p, i) => (i === 0 ? `M${p.x.toFixed(2)} ${p.y.toFixed(2)}` : `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`))
				.join(' ');
			return (
				`<path d="${d}" stroke="${resolveColor(o.style.stroke, theme)}" stroke-width="${o.style.strokeWidth ?? 2}" ` +
				`fill="none" stroke-linecap="round" opacity="${opacity}"/>`
			);
		}
		case 'image': {
			return `<image href="${o.src}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" opacity="${opacity}"${rotationAttr(o)}/>`;
		}
		case 'group':
			return '';
		default:
			return '';
	}
}
