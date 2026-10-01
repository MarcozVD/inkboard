// SelectTool — pointer interaction for selection & transform (§4)
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { SelectionManager, type HandleId } from '$lib/canvas/SelectionManager';
import { expandSelection, groupMembers } from '$lib/board/groups';
import { constrainToAxis, snapAngle, snapOffset } from '$lib/board/snapping';
import { fitBox } from '$lib/objects/textLayout';
import { getObjectBounds } from '$lib/objects/bounds';
import type { Rect, Vec2 } from '$lib/utils/math';
import { toBBox } from '$lib/utils/math';
import { UpdateTransformCommand } from '$lib/canvas/commands';
import {
	applyGeometry,
	captureGeometry,
	rotateObject,
	scaleObject,
	translateObject,
	type GeometrySnapshot
} from '$lib/objects/geometry';

type Mode = 'idle' | 'move' | 'resize' | 'rotate' | 'rect-select';

const HANDLE_HIT = 10; // screen px

export interface SelectToolCallbacks {
	onSelectionChange?: (ids: string[]) => void;
}

export class SelectTool extends BaseTool {
	private sel: SelectionManager;
	private mode: Mode = 'idle';
	private dragStartWorld: Vec2 = { x: 0, y: 0 };
	private dragStartScreen: Vec2 = { x: 0, y: 0 };
	private lastWorld: Vec2 = { x: 0, y: 0 };
	private startGeometries = new Map<string, GeometrySnapshot>();
	private startBounds: Rect | null = null;
	private activeHandle: HandleId | null = null;
	private rectStart: Vec2 = { x: 0, y: 0 };
	private moved = false;
	/** group the user has entered with a double click (one nesting level) */
	private enteredGroupId: string | null = null;

	constructor(ctx: ToolContext, private cb: SelectToolCallbacks = {}) {
		super(ctx);
		this.sel = new SelectionManager(ctx.store);
	}

	get selectionManager(): SelectionManager {
		return this.sel;
	}

	/** Double click entry: select one child inside its group (§M1-05). */
	enterGroup(childId: string): boolean {
		const child = this.ctx.store.get(childId);
		if (!child || !child.groupId) return false;
		this.enteredGroupId = child.groupId;
		this.sel.selectMany([childId]);
		this.cb.onSelectionChange?.(this.sel.selected);
		return true;
	}

	// ── Pointer events (screen space) ──

	pointerDown(e: ToolPointerEvent): void {
		const sx = e.screenX;
		const sy = e.screenY;
		const shift = e.shift;
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

		// 2) hit-test objects (groups resolve to their members; locked select but don't transform)
		const hit = this.sel.hitTest(world);
		if (hit) {
			let ids: string[];
			if (hit.groupId && hit.groupId === this.enteredGroupId) {
				ids = [hit.id]; // inside the entered group: select the child itself
			} else if (hit.groupId) {
				this.enteredGroupId = null;
				ids = groupMembers(this.ctx.store, hit.groupId);
			} else {
				ids = [hit.id];
			}
			if (!ids.every((id) => this.sel.isSelected(id))) {
				this.sel.selectMany(ids, shift);
				this.cb.onSelectionChange?.(this.sel.selected);
			} else if (shift) {
				for (const id of ids) this.sel.toggle(id);
				this.cb.onSelectionChange?.(this.sel.selected);
				return; // click on selected + shift = deselect
			}
			if (!hit.locked) {
				this.mode = 'move';
				this.captureStart();
			}
		} else {
			// empty space: start rect-select
			this.mode = 'rect-select';
			this.rectStart = { ...world };
		}
		this.ctx.onDirty();
	}

	pointerMove(e: ToolPointerEvent): void {
		const sx = e.screenX;
		const sy = e.screenY;
		const shift = e.shift;
		const world = this.screenToWorld(sx, sy);
		this.lastWorld = { ...world };
		if (Math.hypot(sx - this.dragStartScreen.x, sy - this.dragStartScreen.y) > 2) this.moved = true;

		switch (this.mode) {
			case 'move':
				this.applyMove(world, shift);
				break;
			case 'resize':
				this.applyResize(world, shift);
				break;
			case 'rotate':
				this.applyRotate(world, shift);
				break;
			case 'rect-select':
				this.applyRectSelect(world, shift);
				break;
		}
		this.ctx.onDirty();
	}

	pointerUp(_e: ToolPointerEvent): void {
		if (this.mode === 'rect-select' && !this.moved) {
			// simple click on empty space → clear selection
			this.sel.clear();
			this.cb.onSelectionChange?.([]);
		}
		if (this.mode !== 'idle' && this.mode !== 'rect-select' && this.moved) {
			this.commitTransform();
			this.ctx.onGestureEnd?.();
		}
		this.mode = 'idle';
		this.activeHandle = null;
		this.startGeometries.clear();
		this.startBounds = null;
		this.ctx.onDirty();
	}

	/** Called when the tool is deselected mid-gesture — drop any transient state. */
	reset(): void {
		this.mode = 'idle';
		this.activeHandle = null;
		this.startGeometries.clear();
		this.startBounds = null;
		this.moved = false;
		this.enteredGroupId = null;
	}

	/** Push an undo command capturing before/after geometry (§15). */
	private commitTransform(): void {
		if (this.startGeometries.size === 0) return;
		const before = new Map<string, GeometrySnapshot>();
		const after = new Map<string, GeometrySnapshot>();
		for (const [id, snap] of this.startGeometries) {
			const obj = this.ctx.store.get(id);
			if (!obj) continue;
			before.set(id, snap);
			after.set(id, captureGeometry(obj));
		}
		if (before.size === 0) return;
		this.ctx.execute(new UpdateTransformCommand(this.ctx.store, before, after));
	}

	// ── Coordinate helpers ──

	private screenToWorld(sx: number, sy: number): Vec2 {
		const c = this.ctx.camera();
		return { x: (sx - c.x) / c.zoom, y: (sy - c.y) / c.zoom };
	}

	private worldToScreen = (wx: number, wy: number): [number, number] => {
		const c = this.ctx.camera();
		return [wx * c.zoom + c.x, wy * c.zoom + c.y];
	};

	private captureStart(): void {
		this.startGeometries.clear();
		for (const id of this.sel.selected) {
			const obj = this.ctx.store.get(id);
			if (obj) {
				this.startGeometries.set(id, captureGeometry(obj));
			}
		}
		this.startBounds = this.sel.getSelectionBounds();
	}

	// ── Gesture implementations ──

	private applyMove(world: Vec2, shift: boolean): void {
		const delta = constrainToAxis(world.x - this.dragStartWorld.x, world.y - this.dragStartWorld.y, shift);
		const grid = this.ctx.grid?.();
		const snapSize = grid?.snap ? grid.size : 0;
		for (const id of this.sel.selected) {
			const obj = this.ctx.store.get(id);
			const start = this.startGeometries.get(id);
			if (!obj || !start || obj.locked) continue;
			applyGeometry(obj, start);
			translateObject(obj, delta.x, delta.y);
			if (snapSize > 0) {
				const bounds = getObjectBounds(obj);
				const offset = snapOffset(bounds.x, bounds.y, snapSize);
				translateObject(obj, offset.x, offset.y);
			}
			obj.updatedAt = Date.now();
		}
		this.ctx.store.notifyMoved(this.sel.selected);
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
		// scale around the start bounds top-left, then align to the dragged box
		const origin: Vec2 = { x: sb.x, y: sb.y };
		for (const selId of this.sel.selected) {
			const obj = this.ctx.store.get(selId);
			const snap = this.startGeometries.get(selId);
			if (!obj || !snap || obj.locked) continue;
			applyGeometry(obj, snap);
			scaleObject(obj, origin, scaleX, scaleY);
			translateObject(obj, newLeft - sb.x, newTop - sb.y);
			// re-wrap text/sticky to the new width (§M1-08)
			if (obj.type === 'text' || obj.type === 'sticky_note') {
				const box = fitBox(
					{ ...obj.style, lineHeight: obj.type === 'text' ? obj.style.lineHeight : 1.3 },
					obj.content,
					obj.transform.width
				);
				obj.transform.height = Math.max(30, box.height);
			}
			obj.updatedAt = Date.now();
		}
		this.ctx.store.notifyMoved(this.sel.selected);
	}

	private applyRotate(world: Vec2, shift: boolean): void {
		if (!this.startBounds) return;
		const c = this.center(this.startBounds);
		const angle = Math.atan2(world.y - c.y, world.x - c.x);
		const startAngle = Math.atan2(this.dragStartWorld.y - c.y, this.dragStartWorld.x - c.x);
		let delta = angle - startAngle;
		if (shift) delta = snapAngle(delta); // 15° steps
		for (const selId of this.sel.selected) {
			const obj = this.ctx.store.get(selId);
			const snap = this.startGeometries.get(selId);
			if (!obj || !snap || obj.locked) continue;
			applyGeometry(obj, snap);
			rotateObject(obj, c, delta);
			obj.updatedAt = Date.now();
		}
		this.ctx.store.notifyMoved(this.sel.selected);
	}

	private applyRectSelect(world: Vec2, shift: boolean): void {
		const rect: Rect = {
			x: Math.min(this.rectStart.x, world.x),
			y: Math.min(this.rectStart.y, world.y),
			width: Math.abs(world.x - this.rectStart.x),
			height: Math.abs(world.y - this.rectStart.y)
		};
		this.sel.selectInRect(rect, shift);
		// a hit on a group member selects the whole group
		this.sel.selectMany(expandSelection(this.ctx.store, this.sel.selected), true);
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
