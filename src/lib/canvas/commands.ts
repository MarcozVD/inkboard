// Commands — the single mutation layer over ObjectStore (§15, §M1-02).
// Every store mutation goes through a Command executed by engine.execute.
import { v4 as uuidv4 } from 'uuid';
import type { Command, HistoryManager } from './HistoryManager';
import type { ObjectStore } from './ObjectStore';
import type {
	CanvasObject,
	GroupObject,
	StickyNoteObject,
	TextObject,
	Transform
} from '$lib/objects/types';
import { applyGeometry, type GeometrySnapshot } from '$lib/objects/geometry';
import { fitBox } from '$lib/objects/textLayout';
import { getObjectBounds } from '$lib/objects/bounds';
import type { Rect } from '$lib/utils/math';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { ReorderMode } from '$lib/input/shortcuts';

function clone<T extends CanvasObject>(obj: T): T {
	return structuredClone(obj);
}

// ── Object commands ──

/** Add objects (or re-add them after an undo). */
export class AddObjectsCommand implements Command {
	readonly objectIds: string[];

	constructor(
		private store: ObjectStore,
		private objects: CanvasObject[]
	) {
		this.objectIds = objects.map((o) => o.id);
	}

	description = 'Add objects';

	redo(): void {
		this.store.addMany(this.objects);
	}

	undo(): void {
		this.store.removeMany(this.objectIds);
	}
}

/** Remove objects (or restore them on undo). */
export class RemoveObjectsCommand implements Command {
	constructor(
		private store: ObjectStore,
		private objects: CanvasObject[]
	) {}

	description = 'Remove objects';

	redo(): void {
		this.store.removeMany(this.objects.map((o) => o.id));
	}

	undo(): void {
		this.store.addMany(this.objects.map((o) => clone(o)));
	}

	/** Gesture extension (eraser drag): remove now and join this command. */
	removeNow(object: CanvasObject): void {
		this.objects.push(object);
		this.store.remove(object.id);
	}
}

/** Change the geometry of multiple objects (move/resize/rotate).
 * Snapshots cover strokes/connectors points too, not only `transform` (B11). */
export class UpdateTransformCommand implements Command {
	constructor(
		private store: ObjectStore,
		private before: Map<string, GeometrySnapshot>,
		private after: Map<string, GeometrySnapshot>
	) {}

	description = 'Transform';

	undo(): void {
		this.apply(this.before);
	}

	redo(): void {
		this.apply(this.after);
	}

	private apply(map: Map<string, GeometrySnapshot>): void {
		const ids: string[] = [];
		for (const [id, snap] of map) {
			const obj = this.store.get(id);
			if (!obj) continue;
			applyGeometry(obj, snap);
			obj.updatedAt = Date.now();
			ids.push(id);
		}
		if (ids.length) this.store.notifyMoved(ids);
	}
}

/** Change the style of multiple objects (colors, widths, opacity…). */
export class UpdateStyleCommand implements Command {
	constructor(
		private store: ObjectStore,
		private before: Map<string, CanvasObject['style']>,
		private after: Map<string, CanvasObject['style']>
	) {}

	description = 'Update style';

	undo(): void {
		this.apply(this.before);
	}

	redo(): void {
		this.apply(this.after);
	}

	private apply(map: Map<string, CanvasObject['style']>): void {
		const ids: string[] = [];
		for (const [id, style] of map) {
			const obj = this.store.get(id);
			if (!obj) continue;
			obj.style = { ...style } as CanvasObject['style'];
			obj.updatedAt = Date.now();
			ids.push(id);
		}
		if (ids.length) this.store.notifyChange(ids);
	}
}

/** Content snapshot for text-like objects (content + fitted box). */
export interface ContentSnapshot {
	content: string;
	transform: Transform;
}

type EditableObject = TextObject | StickyNoteObject;

/** Change the content (and the fitted box) of a text or sticky note. */
export class UpdateContentCommand implements Command {
	constructor(
		private store: ObjectStore,
		private id: string,
		private before: ContentSnapshot,
		private after: ContentSnapshot
	) {}

	description = 'Edit content';

	undo(): void {
		this.apply(this.before);
	}

	redo(): void {
		this.apply(this.after);
	}

	private apply(snapshot: ContentSnapshot): void {
		const obj = this.store.get(this.id) as EditableObject | undefined;
		if (!obj) return;
		obj.content = snapshot.content;
		obj.transform = { ...snapshot.transform };
		obj.updatedAt = Date.now();
		this.store.notifyMoved([this.id]);
	}
}

/** Change z-order of objects (bringToFront / sendToBack / reorder). */
export class ReorderCommand implements Command {
	constructor(
		private store: ObjectStore,
		private before: Map<string, number>,
		private after: Map<string, number>
	) {}

	description = 'Reorder';

	undo(): void {
		this.apply(this.before);
	}

	redo(): void {
		this.apply(this.after);
	}

	private apply(map: Map<string, number>): void {
		const ids: string[] = [];
		for (const [id, z] of map) {
			const obj = this.store.get(id);
			if (!obj) continue;
			obj.zIndex = z;
			ids.push(id);
		}
		if (ids.length) this.store.notifyChange(ids);
	}
}

/** Lock/unlock objects (§M1-06). */
export class UpdateLockCommand implements Command {
	constructor(
		private store: ObjectStore,
		private before: Map<string, boolean>,
		private after: Map<string, boolean>
	) {}

	description = 'Lock';

	undo(): void {
		this.apply(this.before);
	}

	redo(): void {
		this.apply(this.after);
	}

	private apply(map: Map<string, boolean>): void {
		const ids: string[] = [];
		for (const [id, locked] of map) {
			const obj = this.store.get(id);
			if (!obj) continue;
			obj.locked = locked;
			obj.updatedAt = Date.now();
			ids.push(id);
		}
		if (ids.length) this.store.notifyChange(ids);
	}
}

// ── Grouping (structure only; UI is M1-05) ──

function unionBounds(store: ObjectStore, ids: string[]): Rect {
	let union: Rect | null = null;
	for (const id of ids) {
		const obj = store.get(id);
		if (!obj) continue;
		const b = getObjectBounds(obj);
		union = union
			? {
					x: Math.min(union.x, b.x),
					y: Math.min(union.y, b.y),
					width: Math.max(union.x + union.width, b.x + b.width) - Math.min(union.x, b.x),
					height: Math.max(union.y + union.height, b.y + b.height) - Math.min(union.y, b.y)
				}
			: { ...b };
	}
	return union ?? { x: 0, y: 0, width: 0, height: 0 };
}

/** Create a group around the given children and tag them with its id. */
export class GroupCommand implements Command {
	private group: GroupObject;
	private previousGroupIds = new Map<string, string | undefined>();

	constructor(
		private store: ObjectStore,
		private childIds: string[]
	) {
		const bounds = unionBounds(store, childIds);
		for (const id of childIds) this.previousGroupIds.set(id, store.get(id)?.groupId);
		this.group = {
			id: uuidv4(),
			type: 'group',
			transform: {
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height,
				rotation: 0,
				scaleX: 1,
				scaleY: 1
			},
			style: { opacity: 1 },
			locked: false,
			visible: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			childIds: [...childIds]
		};
	}

	description = 'Group';

	redo(): void {
		this.store.add(this.group);
		for (const id of this.childIds) this.store.update(id, { groupId: this.group.id });
	}

	undo(): void {
		this.store.remove(this.group.id);
		for (const id of this.childIds) this.store.update(id, { groupId: this.previousGroupIds.get(id) });
	}
}

/** Dissolve a group: remove its shell and clear the children's groupId. */
export class UngroupCommand implements Command {
	private group: GroupObject | null = null;
	private childIds: string[] = [];
	private previousGroupIds = new Map<string, string | undefined>();

	constructor(
		private store: ObjectStore,
		groupId: string
	) {
		const group = store.get(groupId);
		if (group && group.type === 'group') {
			this.group = clone(group);
			this.childIds = [...group.childIds];
			for (const id of this.childIds) this.previousGroupIds.set(id, store.get(id)?.groupId);
		}
	}

	description = 'Ungroup';

	redo(): void {
		if (!this.group) return;
		this.store.remove(this.group.id);
		for (const id of this.childIds) this.store.update(id, { groupId: undefined });
	}

	undo(): void {
		if (!this.group) return;
		this.store.add(clone(this.group));
		for (const id of this.childIds) this.store.update(id, { groupId: this.previousGroupIds.get(id) });
	}
}

/** Group several commands into one undo step. */
export class BatchCommand implements Command {
	description: string;

	constructor(
		private commands: Command[],
		description = 'Batch'
	) {
		this.description = description;
	}

	redo(): void {
		for (const cmd of this.commands) cmd.redo();
	}

	undo(): void {
		for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i].undo();
	}
}

// ── History helpers ──

/**
 * Drop the most recent undo entry if it is the Add command for `id`.
 * Used when an empty text/sticky (or a discarded draft) is confirmed: the
 * object and its creation step must both disappear.
 */
export function dropLastAddCommand(history: HistoryManager, id: string): boolean {
	// HistoryManager keeps its stacks private; reach them through the runtime shape.
	const stacks = history as unknown as { undoStack: Command[]; redoStack: Command[] };
	const last = stacks.undoStack[stacks.undoStack.length - 1];
	if (!(last instanceof AddObjectsCommand) || !last.objectIds.includes(id)) return false;
	stacks.undoStack.pop();
	// dropping the entry starts a fresh branch: pending redo is no longer valid
	stacks.redoStack.length = 0;
	return true;
}

// ── Selection actions (undoable, through engine.execute) ──

/** Apply one style patch to objects as a single undo step (§M1-03). */
export function updateStyles(
	engine: CanvasEngine,
	ids: string[],
	patch: Record<string, unknown>
): void {
	const store = engine.store;
	const before = new Map<string, CanvasObject['style']>();
	const after = new Map<string, CanvasObject['style']>();
	for (const id of ids) {
		const obj = store.get(id);
		if (!obj) continue;
		before.set(id, { ...obj.style });
		after.set(id, { ...obj.style, ...patch } as CanvasObject['style']);
	}
	if (before.size === 0) return;
	engine.execute(new UpdateStyleCommand(store, before, after));
}

/** Bring/send the current selection, registering one undo step (M0-08). */
export function reorderObjects(engine: CanvasEngine, mode: ReorderMode): boolean {
	const ids = engine.selectionManager.selected;
	if (ids.length === 0) return false;
	const store = engine.store;
	const before = new Map(store.getAll().map((o) => [o.id, o.zIndex ?? 0]));
	switch (mode) {
		case 'front':
			store.bringToFront(ids);
			break;
		case 'back':
			store.sendToBack(ids);
			break;
		case 'forward':
			store.moveForward(ids);
			break;
		case 'backward':
			store.moveBackward(ids);
			break;
	}
	const after = new Map(store.getAll().map((o) => [o.id, o.zIndex ?? 0]));
	const changed = [...after].some(([id, z]) => before.get(id) !== z);
	if (changed) engine.execute(new ReorderCommand(store, before, after));
	return changed;
}

/** Delete objects (current selection by default) as one undo step.
 * Locked objects are skipped; group shells left without children are removed too. */
export function deleteObjects(engine: CanvasEngine, ids = engine.selectionManager.selected): void {
	const store = engine.store;
	const objs = ids
		.map((id) => store.get(id))
		.filter((obj): obj is CanvasObject => !!obj && !obj.locked);
	if (objs.length === 0) return;
	const removedIds = new Set(objs.map((o) => o.id));
	// group shells whose children are all going away
	for (const obj of store.getAll()) {
		if (obj.type === 'group' && obj.childIds.every((id) => removedIds.has(id))) objs.push(obj);
	}
	engine.execute(new RemoveObjectsCommand(store, objs));
	engine.selectionManager.clear();
}

/** Duplicate the current selection (offset +20/+20) as one undo step. */
export function duplicateObjects(engine: CanvasEngine): string[] {
	const store = engine.store;
	const clones: CanvasObject[] = [];
	for (const id of engine.selectionManager.selected) {
		const obj = store.get(id);
		if (!obj) continue;
		const dup = clone(obj);
		dup.id = uuidv4();
		dup.transform.x += 20;
		dup.transform.y += 20;
		dup.createdAt = Date.now();
		dup.updatedAt = Date.now();
		clones.push(dup);
	}
	if (clones.length === 0) return [];
	engine.execute(new AddObjectsCommand(store, clones));
	engine.selectionManager.selectMany(clones.map((c) => c.id));
	return clones.map((c) => c.id);
}

// ── In-canvas text editing (B03) ──

/** Fit the box to the committed content (single source of truth, §M1-08). */
export function fitContentBox(
	obj: TextObject | StickyNoteObject,
	content: string,
	maxWidth?: number
): { width: number; height: number } {
	return fitBox(
		{ ...obj.style, lineHeight: obj.type === 'text' ? obj.style.lineHeight : 1.3 },
		content,
		maxWidth
	);
}

function isEditableContent(obj: CanvasObject | undefined): obj is TextObject | StickyNoteObject {
	return !!obj && (obj.type === 'text' || obj.type === 'sticky_note');
}

/** Idempotent commit: writes to the real store object via UpdateContentCommand (§B03). */
export function commitTextContent(engine: CanvasEngine, id: string, content: string): void {
	const store = engine.store;
	const obj = store.get(id);
	if (!isEditableContent(obj)) return;

	if (content.trim() === '') {
		// empty confirm: delete the object; if it was just created, delete its
		// creation step from history too (otherwise undo would resurrect it)
		store.remove(id);
		if (!dropLastAddCommand(engine.history, id)) {
			engine.execute(new RemoveObjectsCommand(store, [obj]));
		}
		return;
	}

	const before = { content: obj.content, transform: { ...obj.transform } };
	if (before.content === content) return;

	const box = fitContentBox(obj, content);
	const after = { content, transform: { ...obj.transform, width: box.width, height: box.height } };
	engine.execute(new UpdateContentCommand(store, id, before, after));
}

/** Esc: abort the edit. A freshly created (still empty) object is discarded. */
export function cancelTextContent(engine: CanvasEngine, id: string): boolean {
	const obj = engine.store.get(id);
	if (isEditableContent(obj) && obj.content.trim() === '') {
		engine.discardAdded(id);
		return true;
	}
	return false;
}
