// Spatial index — RBush wrapper (§19). Provides viewport culling candidates.
// NOTE: rbush v4 remove() needs the exact reference that was inserted,
// so we store items by id in a parallel map.
import RBush from 'rbush';
import type { Rect, Vec2 } from '$lib/utils/math';
import { toBBox } from '$lib/utils/math';

export interface SpatialItem {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	objectId: string;
}

export class SpatialIndex {
	private tree = new RBush<SpatialItem>();
	private items = new Map<string, SpatialItem>();

	insert(objectId: string, bounds: Rect): void {
		const item = { ...toBBox(bounds), objectId };
		this.items.set(objectId, item);
		this.tree.insert(item);
	}

	remove(objectId: string, _bounds: Rect): void {
		const item = this.items.get(objectId);
		if (!item) return;
		this.tree.remove(item);
		this.items.delete(objectId);
		void _bounds;
	}

	/** remove + insert in one step */
	update(objectId: string, oldBounds: Rect, newBounds: Rect): void {
		this.remove(objectId, oldBounds);
		this.insert(objectId, newBounds);
	}

	/** object ids whose AABB intersects the viewport */
	queryViewport(viewport: Rect): string[] {
		return this.tree.search(toBBox(viewport)).map((i) => i.objectId);
	}

	/** object ids whose AABB contains the point (with optional padding) */
	queryPoint(point: Vec2, padding = 0): string[] {
		return this.tree
			.search({
				minX: point.x - padding,
				minY: point.y - padding,
				maxX: point.x + padding,
				maxY: point.y + padding
			})
			.map((i) => i.objectId);
	}

	queryRect(rect: Rect): string[] {
		return this.tree.search(toBBox(rect)).map((i) => i.objectId);
	}

	all(): string[] {
		return this.tree.all().map((i) => i.objectId);
	}

	clear(): void {
		this.tree.clear();
		this.items.clear();
	}
}