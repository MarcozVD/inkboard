// connectors — anchor math and endpoint resync (§M1-09, RF-07).
// Connector geometry is derived from its attached objects: whenever the store
// changes, attached endpoints follow their anchor. Free endpoints keep their point.
import type { ObjectStore } from '$lib/canvas/ObjectStore';
import type { ConnectorObject } from '$lib/objects/types';
import { getObjectBounds } from '$lib/objects/bounds';
import type { Rect, Vec2 } from '$lib/utils/math';

export type AnchorSide = 'n' | 'e' | 's' | 'w';

/** Screen-space radius used to snap a connector endpoint to an anchor. */
export const ANCHOR_HIT_SCREEN = 18;

export const ANCHOR_SIDES: readonly AnchorSide[] = ['n', 'e', 's', 'w'];

/** Midpoint of one side of a bounds rect. */
export function anchorPoint(bounds: Rect, side: AnchorSide): Vec2 {
	switch (side) {
		case 'n':
			return { x: bounds.x + bounds.width / 2, y: bounds.y };
		case 's':
			return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
		case 'w':
			return { x: bounds.x, y: bounds.y + bounds.height / 2 };
		default:
			return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
	}
}

/** Side of `bounds` closest to `point`. */
export function nearestSide(bounds: Rect, point: Vec2): AnchorSide {
	let best: AnchorSide = 'e';
	let bestDist = Infinity;
	for (const side of ANCHOR_SIDES) {
		const p = anchorPoint(bounds, side);
		const dist = Math.hypot(p.x - point.x, p.y - point.y);
		if (dist < bestDist) {
			bestDist = dist;
			best = side;
		}
	}
	return best;
}

export interface AnchorHit {
	objectId: string;
	side: AnchorSide;
	point: Vec2;
}

/** Closest anchor within `tolerance` (world units), if any. */
export function nearestAnchor(
	store: ObjectStore,
	world: Vec2,
	tolerance: number,
	excludeIds: string[] = []
): AnchorHit | null {
	let best: AnchorHit | null = null;
	let bestDist = tolerance;
	for (const obj of store.getAll()) {
		if (obj.type === 'group' || excludeIds.includes(obj.id)) continue;
		const bounds = getObjectBounds(obj);
		for (const side of ANCHOR_SIDES) {
			const point = anchorPoint(bounds, side);
			const dist = Math.hypot(point.x - world.x, point.y - world.y);
			if (dist <= bestDist) {
				bestDist = dist;
				best = { objectId: obj.id, side, point };
			}
		}
	}
	return best;
}

function syncEndpoint(store: ObjectStore, connector: ConnectorObject, which: 'start' | 'end'): boolean {
	const objectId = which === 'start' ? connector.startObjectId : connector.endObjectId;
	if (!objectId) return false;

	const obj = store.get(objectId);
	if (!obj) {
		// target deleted: keep the last point as a free endpoint
		if (which === 'start') connector.startObjectId = undefined;
		else connector.endObjectId = undefined;
		return true;
	}

	const point = which === 'start' ? connector.startPoint : connector.endPoint;
	const bounds = getObjectBounds(obj);
	const next = anchorPoint(bounds, nearestSide(bounds, point));
	if (next.x === point.x && next.y === point.y) return false;
	if (which === 'start') connector.startPoint = next;
	else connector.endPoint = next;
	return true;
}

/** Recompute attached endpoints for every connector. Returns changed ids. */
export function syncConnectors(store: ObjectStore): string[] {
	const changed: string[] = [];
	for (const obj of store.getAll()) {
		if (obj.type !== 'connector') continue;
		const connector = obj as ConnectorObject;
		const startChanged = syncEndpoint(store, connector, 'start');
		const endChanged = syncEndpoint(store, connector, 'end');
		if (startChanged || endChanged) changed.push(connector.id);
	}
	return changed;
}

/** Connectors attached (by start or end) to any of the given objects. */
export function connectedConnectors(store: ObjectStore, objectIds: string[]): ConnectorObject[] {
	const ids = new Set(objectIds);
	return store
		.getAll()
		.filter(
			(obj): obj is ConnectorObject =>
				obj.type === 'connector' &&
				((obj.startObjectId != null && ids.has(obj.startObjectId)) ||
					(obj.endObjectId != null && ids.has(obj.endObjectId)))
		);
}
