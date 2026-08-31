// Selection manager — hit-testing, multi-select, selection bounds & handles (§14)
import type { Rect, Vec2 } from '$lib/utils/math';
import { pointInEllipse, pointInRect, distSqToSegment, worldToLocal, toBBox } from '$lib/utils/math';
import type { CanvasObject, ShapeObject, StrokeObject, ConnectorObject } from '$lib/objects/types';
import { getObjectBounds } from '$lib/objects/bounds';
import type { ObjectStore } from './ObjectStore';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

const HANDLE_SIZE = 8;

export interface SelectionHandle {
	id: HandleId;
	position: { x: number; y: number };
	cursor: string;
}

export class SelectionManager {
	private selectedIds = new Set<string>();

	constructor(private store: ObjectStore) {}

	get selected(): string[] {
		return [...this.selectedIds];
	}

	isSelected(id: string): boolean {
		return this.selectedIds.has(id);
	}

	select(id: string, additive = false): void {
		if (!additive) this.selectedIds.clear();
		this.selectedIds.add(id);
	}

	toggle(id: string): void {
		if (this.selectedIds.has(id)) this.selectedIds.delete(id);
		else this.selectedIds.add(id);
	}

	deselect(id: string): void {
		this.selectedIds.delete(id);
	}

	clear(): void {
		this.selectedIds.clear();
	}

	selectMany(ids: string[], additive = false): void {
		if (!additive) this.selectedIds.clear();
		for (const id of ids) this.selectedIds.add(id);
	}

	// ── Hit-testing ──

	/** Find the topmost object under the world-space point (refined by type) */
	hitTest(world: Vec2): CanvasObject | null {
		const candidates = this.store.queryPoint(world, 8);
		if (candidates.length === 0) return null;
		// topmost first (highest zIndex)
		candidates.sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
		for (const obj of candidates) {
			if (pointInObject(obj, world)) return obj;
		}
		return null;
	}

	/** Find all objects whose AABB intersects the world rect, refined. */
	selectInRect(worldRect: Rect, additive = false): string[] {
		const candidates = this.store.queryRect(worldRect);
		const hits: string[] = [];
		for (const obj of candidates) {
			if (objectBoundsIntersectRect(obj, worldRect)) {
				hits.push(obj.id);
			}
		}
		if (!additive) this.selectedIds.clear();
		for (const id of hits) this.selectedIds.add(id);
		return [...this.selectedIds];
	}

	// ── Selection bounds & handles ──

	/** World-space union AABB of all selected objects */
	getSelectionBounds(): Rect | null {
		if (this.selectedIds.size === 0) return null;
		let union: Rect | null = null;
		for (const id of this.selectedIds) {
			const obj = this.store.get(id);
			if (!obj) continue;
			const b = getObjectBounds(obj);
			if (!union) union = { ...b };
			else union = unionRects(union, b);
		}
		return union;
	}

	/** Compute screen-space handles for the selection */
	getHandles(vpTransform: (wx: number, wy: number) => [number, number]): SelectionHandle[] {
		const bounds = this.getSelectionBounds();
		if (!bounds) return [];
		const { x, y, width: w, height: h } = bounds;
		const mid = (a: number, b: number) => (a + b) / 2;
		const sx = (p: { x: number; y: number }) => vpTransform(p.x, p.y);
		const corners: [HandleId, number, number][] = [
			['nw', x, y],
			['ne', x + w, y],
			['se', x + w, y + h],
			['sw', x, y + h],
			['n', mid(x, x + w), y],
			['e', x + w, mid(y, y + h)],
			['s', mid(x, x + w), y + h],
			['w', x, mid(y, y + h)]
		];
		const handles = corners.map(([id, wx, wy]) => {
			const [sx, sy] = vpTransform(wx, wy);
			return { id, position: { x: sx, y: sy }, cursor: cursorForHandle(id) };
		});
		// rotation handle: centered above the top edge
		const [rx, ry] = sx({ x: mid(x, x + w), y: y - 40 });
		handles.push({ id: 'rotate', position: { x: rx, y: ry }, cursor: 'grab' });
		return handles;
	}
}

// ── Per-type hit testing ──

export function pointInObject(obj: CanvasObject, world: Vec2): boolean {
	const local = worldToLocal(world, obj.transform);
	const t = obj.transform;
	const r: Rect = { x: 0, y: 0, width: t.width, height: t.height };

	switch (obj.type) {
		case 'shape':
			return pointInShape(obj as ShapeObject, local, r);
		case 'stroke':
			return pointNearStroke(obj as StrokeObject, world);
		case 'text':
			return pointInRect(local, r, 0);
		case 'image':
			return pointInRect(local, r, 0);
		case 'sticky_note':
			return pointInRect(local, r, 0);
		case 'connector':
			return pointNearConnector(obj as ConnectorObject, world);
		case 'group':
			return pointInRect(local, r, 0);
	}
}

function pointInShape(s: ShapeObject, local: Vec2, r: Rect): boolean {
	switch (s.shape) {
		case 'rect':
		case 'triangle':
		case 'diamond':
			return pointInRect(local, r, 4 / Math.max(1, s.transform.scaleX ?? 1));
		case 'ellipse':
			return pointInEllipse(local, r);
		case 'line':
		case 'arrow': {
			const end = { x: r.width, y: r.height };
			const threshold = (s.style.strokeWidth || 2) / 2 + 4;
			return distSqToSegment(local, { x: 0, y: 0 }, end) <= threshold * threshold;
		}
		case 'star':
		case 'polygon':
			return pointInRect(local, r, 4);
	}
}

function pointNearStroke(s: StrokeObject, world: Vec2): boolean {
	const pts = s.points;
	if (pts.length < 4) return false;
	const threshold = s.style.width / 2 + 6;
	const th2 = threshold * threshold;
	for (let i = 0; i < pts.length - 3; i += 3) {
		const d2 = distSqToSegment(world, { x: pts[i], y: pts[i + 1] }, { x: pts[i + 3], y: pts[i + 4] });
		if (d2 <= th2) return true;
	}
	return false;
}

function pointNearConnector(c: ConnectorObject, world: Vec2): boolean {
	const threshold = c.style.strokeWidth / 2 + 8;
	const th2 = threshold * threshold;
	const points = [c.startPoint, ...(c.waypoints ?? []), c.endPoint];
	for (let i = 0; i < points.length - 1; i++) {
		if (distSqToSegment(world, points[i], points[i + 1]) <= th2) return true;
	}
	return false;
}

function objectBoundsIntersectRect(obj: CanvasObject, rect: Rect): boolean {
	const b = getObjectBounds(obj);
	return !(b.x + b.width < rect.x || rect.x + rect.width < b.x || b.y + b.height < rect.y || rect.y + rect.height < b.y);
}

function unionRects(a: Rect, b: Rect): Rect {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	const right = Math.max(a.x + a.width, b.x + b.width);
	const bottom = Math.max(a.y + a.height, b.y + b.height);
	return { x, y, width: right - x, height: bottom - y };
}

function cursorForHandle(id: HandleId): string {
	const map: Record<HandleId, string> = {
		nw: 'nwse-resize',
		n: 'ns-resize',
		ne: 'nesw-resize',
		e: 'ew-resize',
		se: 'nwse-resize',
		s: 'ns-resize',
		sw: 'nesw-resize',
		w: 'ew-resize',
		rotate: 'grab'
	};
	return map[id];
}