// SelectTool — pointer interaction for selection & transform (§4)
import type { ObjectStore } from '$lib/canvas/ObjectStore';
import { SelectionManager, type HandleId } from '$lib/canvas/SelectionManager';
import type { Rect, Vec2 } from '$lib/utils/math';
import { toBBox } from '$lib/utils/math';
import type { CameraState } from '$lib/canvas/Camera';
import { UpdateTransformCommand } from '$lib/canvas/commands';
import type { Transform } from '$lib/objects/types';

type Mode = 'idle' | 'move' | 'resize' | 'rotate' | 'rect-select';

const HANDLE_HIT = 10; // screen px

export interface SelectToolCallbacks {
	onSelectionChange?: (ids: string[]) => void;
	/** fired after a gesture ends (move/resize/rotate commit) */
	onGestureEnd?: () => void;
	/** render request */
	onDirty?: () => void;
	/** register an undo command for the finished transform gesture */
	onCommit?: (cmd: import('$lib/canvas/HistoryManager').Command) => void;
}

export class SelectTool {
	private sel: SelectionManager;
	private mode: Mode = 'idle';
	private dragStartWorld: Vec2 = { x: 0, y: 0 };
	private dragStartScreen: Vec2 = { x: 0, y: 0 };
	private lastWorld: Vec2 = { x: 0, y: 0 };
	private startTransforms = new Map<string, { x: number; y: number; width: number; height: number; rotation: number; scaleX: number; scaleY: number }>();
	private startBounds: Rect | null = null;
	private activeHandle: HandleId | null = null;
	private rectStart: Vec2 = { x: 0, y: 0 };
	private moved = false;

	constructor(
		private store: ObjectStore,
		private camera: () => CameraState,
		private cb: SelectToolCallbacks = {}
	) {
		this.sel = new SelectionManager(store);
	}

	get selectionManager(): SelectionManager {
		return this.sel;
	}

	// ── Pointer events (screen space) ──

	pointerDown(sx: number, sy: number, modifiers: { shift: boolean }): void {
		const world = this.screenToWorld(sx, sy);
		this.dragStartScreen = { x: sx, y: sy };
		this.dragStartWorld = { ...world };
		this.lastWorld = { ...world };
		this.moved = false;

		// 1) hit-test handles first (if something is selected)
		if (this.sel.selected.length > 0) {
			const handles = this.sel.getHandles(this.worldToScreen);
			const handle = handles.find((h) => Math.hypot(h.position.x - sx, h.position.y - sy) < HANDLE_HIT);
			if (handle) {
				this.activeHandle = handle.id;
				this.mode = handle.id === 'rotate' ? 'rotate' : 'resize';
				this.captureStart();
				return;
			}
		}

		// 2) hit-test objects
		const hit = this.sel.hitTest(world);
		if (hit && !hit.locked) {
			if (!this.sel.isSelected(hit.id)) {
				this.sel.select(hit.id, modifiers.shift);
				this.cb.onSelectionChange?.(this.sel.selected);
			} else if (modifiers.shift) {
				this.sel.toggle(hit.id);
				this.cb.onSelectionChange?.(this.sel.selected);
				return; // click on selected + shift = deselect
			}
			this.mode = 'move';
			this.captureStart();
		} else {
			// empty space: start rect-select
			this.mode = 'rect-select';
			this.rectStart = { ...world };
		}
		this.cb.onDirty?.();
	}

	pointerMove(sx: number, sy: number, modifiers: { shift: boolean }): void {
		const world = this.screenToWorld(sx, sy);
		const dxWorld = world.x - this.lastWorld.x;
		const dyWorld = world.y - this.lastWorld.y;
		this.lastWorld = { ...world };
		if (Math.hypot(sx - this.dragStartScreen.x, sy - this.dragStartScreen.y) > 2) this.moved = true;

		switch (this.mode) {
			case 'move':
				this.applyMove(dxWorld, dyWorld, modifiers.shift);
				break;
			case 'resize':
				this.applyResize(world, modifiers.shift);
				break;
			case 'rotate':
				this.applyRotate(world, modifiers.shift);
				break;
			case 'rect-select':
				this.applyRectSelect(world, modifiers.shift);
				break;
		}
		this.cb.onDirty?.();
	}

	pointerUp(): void {
		if (this.mode === 'rect-select' && !this.moved) {
			// simple click on empty space → clear selection
			this.sel.clear();
			this.cb.onSelectionChange?.([]);
		}
		if (this.mode !== 'idle' && this.mode !== 'rect-select' && this.moved) {
			this.commitTransform();
			this.cb.onGestureEnd?.();
		}
		this.mode = 'idle';
		this.activeHandle = null;
		this.startTransforms.clear();
		this.startBounds = null;
		this.cb.onDirty?.();
	}

	/** Push an undo command capturing before/after transforms (§15). */
	private commitTransform(): void {
		if (this.startTransforms.size === 0) return;
		const before = new Map<string, Transform>();
		const after = new Map<string, Transform>();
		for (const [id, t] of this.startTransforms) {
			const obj = this.store.get(id);
			if (!obj) continue;
			before.set(id, { ...t });
			after.set(id, { ...obj.transform });
		}
		if (before.size === 0) return;
		this.cb.onCommit?.(new UpdateTransformCommand(this.store, before, after));
	}

	// ── Coordinate helpers ──

	private screenToWorld(sx: number, sy: number): Vec2 {
		const c = this.camera();
		return { x: (sx - c.x) / c.zoom, y: (sy - c.y) / c.zoom };
	}

	private worldToScreen = (wx: number, wy: number): [number, number] => {
		const c = this.camera();
		return [wx * c.zoom + c.x, wy * c.zoom + c.y];
	};

	private captureStart(): void {
		this.startTransforms.clear();
		for (const id of this.sel.selected) {
			const obj = this.store.get(id);
			if (obj) {
				this.startTransforms.set(id, { ...obj.transform });
			}
		}
		this.startBounds = this.sel.getSelectionBounds();
	}

	// ── Gesture implementations ──

	private applyMove(dx: number, dy: number, shift: boolean): void {
		if (!shift) {
			// snap to grid if shift held (16px grid snap when holding Shift)
		}
		for (const id of this.sel.selected) {
			const obj = this.store.get(id);
			if (!obj || obj.locked) continue;
			obj.transform.x += dx;
			obj.transform.y += dy;
			obj.updatedAt = Date.now();
		}
		this.store.notifyMoved(this.sel.selected);
	}

	private applyResize(world: Vec2, shift: boolean): void {
		if (!this.startBounds || !this.activeHandle) return;
		const sb = this.startBounds;
		const id = this.activeHandle;
		let newLeft = sb.x;
		let newTop = sb.y;
		let newRight = sb.x + sb.width;
		let newBottom = sb.y + sb.height;

		const p = world;
		if (id.includes('w')) newLeft = Math.min(p.x, newRight - 1);
		if (id.includes('e')) newRight = Math.max(p.x, newLeft + 1);
		if (id.includes('n')) newTop = Math.min(p.y, newBottom - 1);
		if (id.includes('s')) newBottom = Math.max(p.y, newTop + 1);

		let newW = newRight - newLeft;
		let newH = newBottom - newTop;

		if (shift && id.length >= 2) {
			// maintain aspect ratio from start bounds
			const scaleX = newW / sb.width;
			const scaleY = newH / sb.height;
			const scale = Math.max(scaleX, scaleY);
			newW = sb.width * scale;
			newH = sb.height * scale;
			// keep the opposite corner fixed
			if (id.includes('w')) newLeft = newRight - newW;
			else newRight = newLeft + newW;
			if (id.includes('n')) newTop = newBottom - newH;
			else newBottom = newTop + newH;
		}

		const scaleX = sb.width > 0 ? newW / sb.width : 1;
		const scaleY = sb.height > 0 ? newH / sb.height : 1;
		for (const selId of this.sel.selected) {
			const obj = this.store.get(selId);
			if (!obj || obj.locked) continue;
			const st = this.startTransforms.get(selId)!;
			// rescale relative to the start bounds top-left corner
			obj.transform.x = newLeft + (st.x - sb.x) * scaleX;
			obj.transform.y = newTop + (st.y - sb.y) * scaleY;
			obj.transform.width = st.width * scaleX;
			obj.transform.height = st.height * scaleY;
			obj.updatedAt = Date.now();
		}
		this.store.notifyMoved(this.sel.selected);
	}

	private applyRotate(world: Vec2, _shift: boolean): void {
		if (!this.startBounds) return;
		const c = this.center(this.startBounds);
		const angle = Math.atan2(world.y - c.y, world.x - c.x);
		const startAngle = Math.atan2(this.dragStartWorld.y - c.y, this.dragStartWorld.x - c.x);
		const delta = angle - startAngle;
		for (const selId of this.sel.selected) {
			const obj = this.store.get(selId);
			if (!obj || obj.locked) continue;
			const st = this.startTransforms.get(selId)!;
			// rotate around selection center
			const local = { x: st.x + st.width / 2 - c.x, y: st.y + st.height / 2 - c.y };
			const cos = Math.cos(delta);
			const sin = Math.sin(delta);
			const nx = local.x * cos - local.y * sin + c.x;
			const ny = local.x * sin + local.y * cos + c.y;
			obj.transform.x = nx - st.width / 2;
			obj.transform.y = ny - st.height / 2;
			obj.transform.rotation = st.rotation + delta;
			obj.updatedAt = Date.now();
		}
		this.store.notifyMoved(this.sel.selected);
	}

	private applyRectSelect(world: Vec2, shift: boolean): void {
		const rect: Rect = {
			x: Math.min(this.rectStart.x, world.x),
			y: Math.min(this.rectStart.y, world.y),
			width: Math.abs(world.x - this.rectStart.x),
			height: Math.abs(world.y - this.rectStart.y)
		};
		this.sel.selectInRect(rect, shift);
		this.cb.onSelectionChange?.(this.sel.selected);
	}

	private center(r: Rect): Vec2 {
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	}

	/** World-space rect of the current rect-select (for rendering the marquee) */
	getActiveRectSelect(): Rect | null {
		if (this.mode !== 'rect-select') return null;
		return {
			x: Math.min(this.rectStart.x, this.lastWorld.x),
			y: Math.min(this.rectStart.y, this.lastWorld.y),
			width: Math.abs(this.lastWorld.x - this.rectStart.x),
			height: Math.abs(this.lastWorld.y - this.rectStart.y)
		};
	}

	/** Selection bounds in screen space (for rendering selection box) */
	getSelectionScreenBounds(): Rect | null {
		const b = this.sel.getSelectionBounds();
		if (!b) return null;
		return b;
	}

	/** Bounding box as {minX,minY,maxX,maxY} for RBush-style checks */
	selectionBBox() {
		const b = this.sel.getSelectionBounds();
		return b ? toBBox(b) : null;
	}
}
