// Object factories — construct valid typed objects (§11).
import { v4 as uuidv4 } from 'uuid';
import type {
	CanvasObject,
	ConnectorObject,
	ImageObject,
	ShapeObject,
	ShapeStyle,
	ShapeType,
	StickyNoteObject,
	StrokeObject,
	StrokeStyle,
	TextObject,
	TextStyle,
	Transform
} from '$lib/objects/types';

function transform(x: number, y: number, width: number, height: number, rotation = 0): Transform {
	return { x, y, width, height, rotation, scaleX: 1, scaleY: 1 };
}

function base<T extends CanvasObject['type']>(id: string, type: T, t: Transform) {
	return { id: id ?? uuidv4(), type, transform: t, locked: false, visible: true, createdAt: Date.now(), updatedAt: Date.now() };
}

export function createStroke(points: number[], style: Partial<StrokeStyle> = {}, t?: Transform): StrokeObject {
	const xs = points.filter((_, i) => i % 3 === 0);
	const ys = points.filter((_, i) => i % 3 === 1);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const maxX = Math.max(...xs);
	const maxY = Math.max(...ys);
	const s: StrokeStyle = { color: '#e8e9ec', width: 3, lineCap: 'round', lineJoin: 'round', isHighlighter: false, opacity: 1, ...style };
	return {
		...base(uuidv4(), 'stroke', t ?? transform(minX, minY, maxX - minX, maxY - minY)),
		points,
		style: s
	};
}

export function createText(x: number, y: number, content: string, style: Partial<TextStyle> = {}): TextObject {
	const s: TextStyle = {
		fontFamily: 'Segoe UI, sans-serif',
		fontSize: 24,
		fontWeight: 'normal',
		fontStyle: 'normal',
		textDecoration: 'none',
		textAlign: 'left',
		color: '#e8e9ec',
		lineHeight: 1.3,
		padding: 4,
		opacity: 1,
		...style
	};
	const lines = content.split('\n');
	const width = Math.max(...lines.map((l) => l.length)) * s.fontSize * 0.6 + s.padding * 2;
	const height = lines.length * s.fontSize * s.lineHeight + s.padding * 2;
	return { ...base(uuidv4(), 'text', transform(x, y, width, height)), content, style: s };
}

export function createShape(x: number, y: number, width: number, height: number, shape: ShapeType, style: Partial<ShapeStyle> = {}): ShapeObject {
	const s: ShapeStyle = { fill: 'none', stroke: '#e8e9ec', strokeWidth: 2, opacity: 1, ...style };
	return { ...base(uuidv4(), 'shape', transform(x, y, width, height)), shape, style: s };
}

export function createStickyNote(x: number, y: number, content: string, style: Partial<StickyNoteObject['style']> = {}): StickyNoteObject {
	const s = {
		backgroundColor: '#FFD666',
		textColor: '#3a2d00',
		fontSize: 16,
		fontFamily: 'Segoe UI, sans-serif',
		padding: 12,
		opacity: 1,
		...style
	};
	return { ...base(uuidv4(), 'sticky_note', transform(x, y, 220, 200)), content, style: s };
}

export function createImage(x: number, y: number, src: string, originalWidth: number, originalHeight: number): ImageObject {
	const aspect = originalHeight / Math.max(1, originalWidth);
	const width = Math.min(400, originalWidth || 400);
	const height = width * aspect;
	return {
		...base(uuidv4(), 'image', transform(x, y, width, height)),
		style: { opacity: 1 },
		src,
		originalWidth,
		originalHeight
	};
}

export function createConnector(start: { x: number; y: number }, end: { x: number; y: number }, style: Partial<ConnectorObject['style']> = {}): ConnectorObject {
	const s = { stroke: '#e8e9ec', strokeWidth: 2, startArrow: 'none', endArrow: 'none', routing: 'straight', opacity: 1, ...style } as ConnectorObject['style'];
	const minX = Math.min(start.x, end.x);
	const minY = Math.min(start.y, end.y);
	return {
		...base(uuidv4(), 'connector', transform(minX, minY, Math.abs(end.x - start.x), Math.abs(end.y - start.y))),
		startPoint: start,
		endPoint: end,
		style: s
	};
}
