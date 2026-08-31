// Object renderers — Canvas 2D drawing for every object type (§3).
import { getStroke } from 'perfect-freehand';
import type {
	CanvasObject,
	ShapeObject,
	StrokeObject,
	TextObject,
	StickyNoteObject,
	ImageObject,
	ConnectorObject,
	GroupObject
} from '$lib/objects/types';

/**
 * Render an object. `ctx` must already have the camera transform applied
 * (§12 — world coords, setTransform once per frame).
 * Images: callers may pass an image cache to avoid re-decoding data URLs.
 */
export function renderObject(
	ctx: CanvasRenderingContext2D,
	obj: CanvasObject,
	opts: { getImage?: (src: string) => HTMLImageElement | undefined } = {}
): void {
	if (!obj.visible) return;

	// Geometric types (stroke, connector) store world-space coords directly in
	// their points/points, so they must NOT receive the local transform.
	if (obj.type === 'stroke' || obj.type === 'connector') {
		ctx.save();
		ctx.globalAlpha = obj.style.opacity ?? 1;
		if (obj.type === 'stroke') renderStroke(ctx, obj);
		else renderConnector(ctx, obj);
		ctx.restore();
		return;
	}

	ctx.save();
	ctx.globalAlpha = obj.style.opacity ?? 1;

	const t = obj.transform;
	// transform: translate to origin, rotate, scale, then draw in local space
	ctx.translate(t.x, t.y);
	ctx.rotate(t.rotation ?? 0);
	ctx.scale(t.scaleX ?? 1, t.scaleY ?? 1);

	switch (obj.type) {
		case 'shape':
			renderShape(ctx, obj);
			break;
		case 'text':
			renderText(ctx, obj);
			break;
		case 'sticky_note':
			renderStickyNote(ctx, obj);
			break;
		case 'image':
			renderImage(ctx, obj, opts.getImage);
			break;
		case 'group':
			break; // groups render via their children in the store
	}
	ctx.restore();
}

// ── Stroke ──

function renderStroke(ctx: CanvasRenderingContext2D, s: StrokeObject) {
	const pts = s.points;
	if (pts.length < 4) return;

	const style = s.style;
	ctx.save();
	ctx.strokeStyle = style.color;
	ctx.fillStyle = style.color;
	if (style.isHighlighter) {
		ctx.globalAlpha = (style.opacity ?? 1) * 0.4;
	}
	if (style.compositeOperation) ctx.globalCompositeOperation = style.compositeOperation;

	if (s.smoothedPoints && s.smoothedPoints.length >= 4) {
		// pre-computed outline (set by tools after gesture) — cheap path
		drawOutline(ctx, s.smoothedPoints);
	} else {
		// live outline via perfect-freehand (pressure-aware, smooth)
		const input: number[][] = [];
		for (let i = 0; i < pts.length; i += 3) {
			input.push([pts[i], pts[i + 1], pts[i + 2]]);
		}
		const outline = getStroke(input, {
			size: style.width,
			thinning: style.isHighlighter ? 0.35 : 0.65,
			smoothing: 0.5,
			simulatePressure: false,
			start: { taper: style.isHighlighter ? 0 : 40, cap: true },
			end: { taper: style.isHighlighter ? 0 : 40, cap: true }
		});
		drawOutline(ctx, outline.flat());
	}
	ctx.restore();
}

function drawOutline(ctx: CanvasRenderingContext2D, flatOutline: number[]) {
	if (flatOutline.length < 6) return;
	ctx.beginPath();
	ctx.moveTo(flatOutline[0], flatOutline[1]);
	for (let i = 2; i < flatOutline.length; i += 2) {
		ctx.lineTo(flatOutline[i], flatOutline[i + 1]);
	}
	ctx.closePath();
	ctx.fill();
}

// ── Shapes ──

function renderShape(ctx: CanvasRenderingContext2D, s: ShapeObject) {
	const { width: w, height: h } = s.transform;
	const sw = Math.abs(w);
	const sh = Math.abs(h);
	const style = s.style;
	const hasFill = style.fill && style.fill !== 'none';
	const hasStroke = style.stroke && style.stroke !== 'none';

	ctx.save();
	if (hasFill) {
		ctx.fillStyle = style.fill;
	}
	if (hasStroke) {
		ctx.strokeStyle = style.stroke;
		ctx.lineWidth = style.strokeWidth || 1;
		if (style.strokeDash?.length) ctx.setLineDash(style.strokeDash);
	}

	ctx.beginPath();
	switch (s.shape) {
		case 'rect': {
			const r = style.cornerRadius ?? 0;
			if (r > 0) {
				ctx.roundRect(0, 0, sw, sh, Math.min(r, sw / 2, sh / 2));
			} else {
				ctx.rect(0, 0, sw, sh);
			}
			break;
		}
		case 'ellipse': {
			ctx.ellipse(sw / 2, sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
			break;
		}
		case 'line':
		case 'arrow': {
			ctx.moveTo(0, 0);
			ctx.lineTo(sw, sh);
			break;
		}
		case 'triangle': {
			ctx.moveTo(sw / 2, 0);
			ctx.lineTo(sw, sh);
			ctx.lineTo(0, sh);
			ctx.closePath();
			break;
		}
		case 'diamond': {
			ctx.moveTo(sw / 2, 0);
			ctx.lineTo(sw, sh / 2);
			ctx.lineTo(sw / 2, sh);
			ctx.lineTo(0, sh / 2);
			ctx.closePath();
			break;
		}
		case 'star': {
			starPath(ctx, sw / 2, sh / 2, Math.min(sw, sh) / 2, s.sides ?? 5, s.innerRadius ?? 0.5);
			break;
		}
		case 'polygon': {
			polygonPath(ctx, sw / 2, sh / 2, Math.min(sw, sh) / 2, s.sides ?? 6);
			break;
		}
	}
	if (hasFill) ctx.fill();
	if (hasStroke) ctx.stroke();
	ctx.restore();

	// arrowhead for arrow shapes (drawn after fill/stroke)
	if (s.shape === 'arrow' && hasStroke) {
		drawArrowHead(ctx, sw, sh, style.stroke, style.strokeWidth || 1);
	}
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points: number, innerRatio: number) {
	for (let i = 0; i < points * 2; i++) {
		const radius = i % 2 === 0 ? r : r * innerRatio;
		const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
		const x = cx + Math.cos(angle) * radius;
		const y = cy + Math.sin(angle) * radius;
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.closePath();
}

function polygonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number) {
	for (let i = 0; i < sides; i++) {
		const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
		const x = cx + Math.cos(angle) * r;
		const y = cy + Math.sin(angle) * r;
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.closePath();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, width: number) {
	const angle = Math.atan2(h, w);
	const headLen = Math.max(10, width * 4);
	const tipX = w;
	const tipY = h;
	ctx.save();
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(tipX, tipY);
	ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 6), tipY - headLen * Math.sin(angle - Math.PI / 6));
	ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 6), tipY - headLen * Math.sin(angle + Math.PI / 6));
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

// ── Text ──

function renderText(ctx: CanvasRenderingContext2D, t: TextObject) {
	const style = t.style;
	const size = style.fontSize;
	ctx.save();
	ctx.font = `${style.fontStyle === 'italic' ? 'italic ' : ''}${style.fontWeight === 'bold' ? 'bold ' : ''}${size}px ${style.fontFamily}`;
	ctx.fillStyle = style.color;
	ctx.textBaseline = 'top';
	ctx.textAlign = style.textAlign || 'left';

	if (style.backgroundColor) {
		ctx.fillStyle = style.backgroundColor;
		ctx.fillRect(-style.padding, -style.padding, t.transform.width + style.padding * 2, t.transform.height + style.padding * 2);
		ctx.fillStyle = style.color;
	}

	const lines = t.content.split('\n');
	const lineHeight = size * (style.lineHeight || 1.3);
	const align = style.textAlign || 'left';
	lines.forEach((line, i) => {
		let x = 0;
		if (align === 'center') x = t.transform.width / 2;
		else if (align === 'right') x = t.transform.width;
		ctx.fillText(line, x, i * lineHeight);
	});
	ctx.restore();
}

// ── Sticky note ──

const STICKY_NOTE_COLORS = ['#FFD666', '#FF9F66', '#FF7A7A', '#7ACC7A', '#66B3FF', '#B08CFF', '#FF8CBF', '#8CD6C4'];

export function stickyNoteColors(): string[] {
	return STICKY_NOTE_COLORS;
}

function renderStickyNote(ctx: CanvasRenderingContext2D, n: StickyNoteObject) {
	const { width: w, height: h } = n.transform;
	const style = n.style;
	ctx.save();
	ctx.fillStyle = style.backgroundColor;
	ctx.strokeStyle = 'rgba(0,0,0,0.12)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.roundRect(0, 0, w, h, 4);
	ctx.fill();
	ctx.stroke();

	// fold shadow (top-right corner)
	ctx.fillStyle = 'rgba(0,0,0,0.08)';
	ctx.beginPath();
	ctx.moveTo(w - 14, 0);
	ctx.lineTo(w, 14);
	ctx.lineTo(w, 0);
	ctx.closePath();
	ctx.fill();

	// text
	ctx.font = `${style.fontSize}px ${style.fontFamily}`;
	ctx.fillStyle = style.textColor;
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';
	const lines = n.content.split('\n');
	lines.forEach((line, i) => {
		ctx.fillText(line, style.padding, style.padding + i * style.fontSize * 1.3);
	});
	ctx.restore();
}

// ── Image ──

function renderImage(ctx: CanvasRenderingContext2D, img: ImageObject, getImage?: (src: string) => HTMLImageElement | undefined) {
	const { width: w, height: h } = img.transform;
	if (w <= 0 || h <= 0) return;

	const el = getImage?.(img.src);
	if (el && el.complete && el.naturalWidth > 0) {
		const crop = img.cropRect;
		if (crop) {
			const sx = (crop.x / img.originalWidth) * el.naturalWidth;
			const sy = (crop.y / img.originalHeight) * el.naturalHeight;
			const sw = (crop.w / img.originalWidth) * el.naturalWidth;
			const sh = (crop.h / img.originalHeight) * el.naturalHeight;
			ctx.drawImage(el, sx, sy, sw, sh, 0, 0, w, h);
		} else {
			ctx.drawImage(el, 0, 0, w, h);
		}
	} else {
		// placeholder while loading
		ctx.fillStyle = 'rgba(128,128,128,0.25)';
		ctx.fillRect(0, 0, w, h);
		ctx.strokeStyle = 'rgba(128,128,128,0.5)';
		ctx.strokeRect(0, 0, w, h);
	}
}

// ── Connector ──

function renderConnector(ctx: CanvasRenderingContext2D, c: ConnectorObject) {
	const style = c.style;
	ctx.save();
	ctx.strokeStyle = style.stroke;
	ctx.lineWidth = style.strokeWidth || 2;
	ctx.lineCap = 'round';
	if (style.strokeDash?.length) ctx.setLineDash(style.strokeDash);

	const start = c.startPoint;
	const end = c.endPoint;
	const waypoints = c.waypoints ?? [];

	ctx.beginPath();
	ctx.moveTo(start.x, start.y);
	for (const wp of waypoints) ctx.lineTo(wp.x, wp.y);
	ctx.lineTo(end.x, end.y);
	ctx.stroke();
	ctx.restore();

	if (style.endArrow === 'arrow') {
		const angle = Math.atan2(end.y - (waypoints.at(-1)?.y ?? start.y), end.x - (waypoints.at(-1)?.x ?? start.x));
		const headLen = 12;
		ctx.save();
		ctx.fillStyle = style.stroke;
		ctx.beginPath();
		ctx.moveTo(end.x, end.y);
		ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
		ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}
}
