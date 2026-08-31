// ObjectStore — source of truth for canvas objects (§3). CRUD + spatial index.
import { SpatialIndex } from '$lib/canvas/SpatialIndex';
import { getObjectBounds } from '$lib/objects/bounds';
import type { Rect, Vec2 } from '$lib/utils/math';
import type { CanvasObject } from '$lib/objects/types';

/** Emitted after any mutation. `type` is the granular change kind. */
export interface ObjectStoreEvent {
	added: string[];
	modified: string[];
	removed: string[];
}

export class ObjectStore {
	private objects = new Map<string, CanvasObject>();
	private spatial = new SpatialIndex();
	private nextZ = 0;

	/** Listeners receive a summary of the last mutation batch. */
	private listeners = new Set<(ev: ObjectStoreEvent) => void>();

	onChange(fn: (ev: ObjectStoreEvent) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private emit(ev: ObjectStoreEvent): void {
		for (const fn of this.listeners) fn(ev);
	}

	// ── CRUD ──

	add(obj: CanvasObject): CanvasObject {
		if (!obj.id) throw new Error('ObjectStore.add: object needs an id');
		obj.zIndex = obj.zIndex !== undefined ? obj.zIndex : this.nextZ++;
		this.nextZ = Math.max(this.nextZ, (obj.zIndex ?? 0) + 1);
		this.objects.set(obj.id, obj);
		this.spatial.insert(obj.id, getObjectBounds(obj));
		this.emit({ added: [obj.id], modified: [], removed: [] });
		return obj;
	}

	/** Adds many objects in one batch (single event, one spatial pass). */
	addMany(objs: CanvasObject[]): void {
		const added: string[] = [];
		for (const obj of objs) {
			if (!obj.id) throw new Error('ObjectStore.addMany: object needs an id');
			obj.zIndex = obj.zIndex !== undefined ? obj.zIndex : this.nextZ++;
			this.nextZ = Math.max(this.nextZ, (obj.zIndex ?? 0) + 1);
			this.objects.set(obj.id, obj);
			this.spatial.insert(obj.id, getObjectBounds(obj));
			added.push(obj.id);
		}
		this.emit({ added, modified: [], removed: [] });
	}

	update(id: string, patch: Partial<CanvasObject>): CanvasObject | null {
		const obj = this.objects.get(id);
		if (!obj) return null;
		const oldBounds = getObjectBounds(obj);
		Object.assign(obj, patch);
		obj.updatedAt = Date.now();
		const newBounds = getObjectBounds(obj);
		if (oldBounds.x !== newBounds.x || oldBounds.y !== newBounds.y || oldBounds.width !== newBounds.width || oldBounds.height !== newBounds.height) {
			this.spatial.update(id, oldBounds, newBounds);
		}
		this.emit({ added: [], modified: [id], removed: [] });
		return obj;
	}

	remove(id: string): boolean {
		const obj = this.objects.get(id);
		if (!obj) return false;
		this.objects.delete(id);
		this.spatial.remove(id, getObjectBounds(obj));
		this.emit({ added: [], modified: [], removed: [id] });
		return true;
	}

	removeMany(ids: string[]): void {
		const removed: string[] = [];
		for (const id of ids) {
			const obj = this.objects.get(id);
			if (!obj) continue;
			this.objects.delete(id);
			this.spatial.remove(id, getObjectBounds(obj));
			removed.push(id);
		}
		if (removed.length) this.emit({ added: [], modified: [], removed });
	}

	// ── Queries ──

	get(id: string): CanvasObject | undefined {
		return this.objects.get(id);
	}

	getAll(): CanvasObject[] {
		return [...this.objects.values()];
	}

	size(): number {
		return this.objects.size;
	}

	/** Viewport culling candidates (§19) */
	queryViewport(viewport: Rect): CanvasObject[] {
		return this.spatial.queryViewport(viewport).map((id) => this.objects.get(id)!).filter(Boolean);
	}

	/** Candidates for point hit-testing (§14) */
	queryPoint(point: Vec2, padding = 0): CanvasObject[] {
		return this.spatial.queryPoint(point, padding).map((id) => this.objects.get(id)!).filter(Boolean);
	}

	queryRect(rect: Rect): CanvasObject[] {
		return this.spatial.queryRect(rect).map((id) => this.objects.get(id)!).filter(Boolean);
	}

	// ── Z-order ──

	/** Objects sorted by zIndex ascending (paint order). */
	sortedByZ(): CanvasObject[] {
		return [...this.objects.values()].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
	}

	maxZIndex(): number {
		return this.nextZ - 1;
	}

	/** Bring ids to front (top of z-order) */
	bringToFront(ids: string[]): void {
		// place selected objects above the current global top
		let top = -1;
		for (const obj of this.objects.values()) {
			if (!ids.includes(obj.id)) top = Math.max(top, obj.zIndex ?? 0);
		}
		const sorted = [...ids].sort(
			(a, b) => (this.objects.get(a)?.zIndex ?? 0) - (this.objects.get(b)?.zIndex ?? 0)
		);
		const modified: string[] = [];
		sorted.forEach((id, i) => {
			const obj = this.objects.get(id);
			if (obj) {
				obj.zIndex = top + 1 + i;
				obj.updatedAt = Date.now();
				modified.push(id);
			}
		});
		if (modified.length) {
			this.nextZ = Math.max(this.nextZ, top + 1 + sorted.length);
			this.emit({ added: [], modified, removed: [] });
		}
	}

	/** Send ids to back (bottom of z-order) */
	sendToBack(ids: string[]): void {
		const sorted = [...ids].sort((a, b) => (this.objects.get(a)?.zIndex ?? 0) - (this.objects.get(b)?.zIndex ?? 0));
		const min = this.objects.get(sorted[0])?.zIndex ?? 0;
		const modified: string[] = [];
		// shift everything down that's above the target set
		let cursor = 0;
		for (const obj of this.sortedByZ()) {
			if (ids.includes(obj.id)) continue;
			obj.zIndex = cursor++;
			obj.updatedAt = Date.now();
			modified.push(obj.id);
		}
		sorted.forEach((id) => {
			const obj = this.objects.get(id);
			if (obj) {
				obj.zIndex = cursor++;
				obj.updatedAt = Date.now();
				modified.push(id);
			}
		});
		// note: sendToBack touches many objects — acceptable for MVP
		this.nextZ = Math.max(this.nextZ, cursor);
		if (modified.length) this.emit({ added: [], modified, removed: [] });
		void min;
	}

	// ── Serialization helper (model only, see lib/io) ──

	toJSON(): CanvasObject[] {
		return this.sortedByZ();
	}

	clear(): void {
		this.objects.clear();
		this.spatial.clear();
		this.nextZ = 0;
		this.emit({ added: [], modified: [], removed: [] });
	}
}
