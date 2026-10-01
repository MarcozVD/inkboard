// Property test for command invariants (§M1-02, §15):
//   undo(redo(s)) ≡ s        and        redo(undo(redo(s))) ≡ redo(s)
// over the serialized JSON of the store, for every command type.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { HistoryManager, type Command } from './HistoryManager';
import { ObjectStore } from './ObjectStore';
import {
	AddObjectsCommand,
	BatchCommand,
	GroupCommand,
	RemoveObjectsCommand,
	ReorderCommand,
	UngroupCommand,
	UpdateContentCommand,
	UpdateLockCommand,
	UpdateStyleCommand,
	UpdateTransformCommand,
	fitContentBox
} from './commands';
import { createConnector, createShape, createStickyNote, createStroke, createText } from '$lib/objects/factory';
import { captureGeometry, rotateObject, scaleObject, translateObject } from '$lib/objects/geometry';
import type { CanvasObject, StickyNoteObject, TextObject } from '$lib/objects/types';

// `updatedAt` is a wall-clock timestamp (Date.now) that redo legitimately
// refreshes; strip it so the invariant compares undoable state only.
function stripTimestamps(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripTimestamps);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value)) {
			if (key === 'updatedAt') continue;
			out[key] = stripTimestamps(val);
		}
		return out;
	}
	return value;
}

const snapshot = (store: ObjectStore): unknown => stripTimestamps(JSON.parse(JSON.stringify(store.toJSON())));

function makeObject(kind: number, i: number): CanvasObject {
	switch (kind % 5) {
		case 0:
			return createShape(i * 50, i * 40, 60, 40, 'rect');
		case 1:
			return createText(i * 30, i * 20, `text-${i}`);
		case 2:
			return createStickyNote(i * 20, i * 10, `sticky-${i}`);
		case 3:
			return createStroke([i, i, 0.5, i + 20, i + 10, 0.5]);
		default:
			return createConnector({ x: i, y: i }, { x: i + 30, y: i + 30 });
	}
}

function isEditable(obj: CanvasObject): obj is TextObject | StickyNoteObject {
	return obj.type === 'text' || obj.type === 'sticky_note';
}

type Op =
	| { kind: 'add' }
	| { kind: 'remove'; picks: number[] }
	| { kind: 'transform'; picks: number[]; dx: number; dy: number; scale: number; angle: number }
	| { kind: 'style'; picks: number[]; opacity: number }
	| { kind: 'lock'; picks: number[] }
	| { kind: 'content'; picks: number[] }
	| { kind: 'reorder'; shift: number }
	| { kind: 'group'; picks: number[] }
	| { kind: 'ungroup' }
	| { kind: 'batch'; opacity: number; shift: number };

const picksArb = fc.array(fc.nat({ max: 3 }), { maxLength: 3 });

const opArb: fc.Arbitrary<Op> = fc.oneof(
	fc.constant({ kind: 'add' as const }),
	fc.record({ kind: fc.constant('remove' as const), picks: picksArb }),
	fc.record({
		kind: fc.constant('transform' as const),
		picks: picksArb,
		dx: fc.integer({ min: -100, max: 100 }),
		dy: fc.integer({ min: -100, max: 100 }),
		scale: fc.constantFrom(0.5, 1, 2),
		angle: fc.constantFrom(0, Math.PI / 4, Math.PI / 2)
	}),
	fc.record({
		kind: fc.constant('style' as const),
		picks: picksArb,
		opacity: fc.constantFrom(0.25, 0.5, 1)
	}),
	fc.record({ kind: fc.constant('lock' as const), picks: picksArb }),
	fc.record({ kind: fc.constant('content' as const), picks: picksArb }),
	fc.record({ kind: fc.constant('reorder' as const), shift: fc.nat({ max: 3 }) }),
	fc.record({ kind: fc.constant('group' as const), picks: picksArb }),
	fc.constant({ kind: 'ungroup' as const }),
	fc.record({
		kind: fc.constant('batch' as const),
		opacity: fc.constantFrom(0.25, 1),
		shift: fc.nat({ max: 3 })
	})
);

function resolveIds(store: ObjectStore, picks: number[]): string[] {
	const ids = store.getAll().map((o) => o.id);
	const picked = new Set<string>();
	for (const p of picks) {
		if (ids.length > 0) picked.add(ids[p % ids.length]);
	}
	return [...picked];
}

function buildCommand(store: ObjectStore, op: Op): Command | null {
	const ids = store.getAll().map((o) => o.id);

	switch (op.kind) {
		case 'add':
			return new AddObjectsCommand(store, [makeObject(store.size(), store.size())]);

		case 'remove': {
			const targets = resolveIds(store, op.picks);
			if (targets.length === 0) return null;
			const objs = targets.map((id) => store.get(id)).filter(Boolean) as CanvasObject[];
			return new RemoveObjectsCommand(store, objs);
		}

		case 'transform': {
			const targets = resolveIds(store, op.picks);
			if (targets.length === 0) return null;
			const before = new Map<string, ReturnType<typeof captureGeometry>>();
			const after = new Map<string, ReturnType<typeof captureGeometry>>();
			for (const id of targets) {
				const obj = store.get(id);
				if (!obj) continue;
				before.set(id, captureGeometry(obj));
				const mutated = structuredClone(obj);
				translateObject(mutated, op.dx, op.dy);
				scaleObject(mutated, { x: 0, y: 0 }, op.scale, op.scale);
				rotateObject(mutated, { x: 0, y: 0 }, op.angle);
				after.set(id, captureGeometry(mutated));
			}
			return before.size > 0 ? new UpdateTransformCommand(store, before, after) : null;
		}

		case 'style': {
			const targets = resolveIds(store, op.picks);
			if (targets.length === 0) return null;
			const before = new Map<string, CanvasObject['style']>();
			const after = new Map<string, CanvasObject['style']>();
			for (const id of targets) {
				const obj = store.get(id);
				if (!obj) continue;
				before.set(id, { ...obj.style });
				after.set(id, { ...obj.style, opacity: op.opacity });
			}
			return before.size > 0 ? new UpdateStyleCommand(store, before, after) : null;
		}

		case 'lock': {
			const targets = resolveIds(store, op.picks);
			if (targets.length === 0) return null;
			const before = new Map<string, boolean>();
			const after = new Map<string, boolean>();
			for (const id of targets) {
				const obj = store.get(id);
				if (!obj) continue;
				before.set(id, obj.locked);
				after.set(id, !obj.locked);
			}
			return before.size > 0 ? new UpdateLockCommand(store, before, after) : null;
		}

		case 'content': {
			const targets = resolveIds(store, op.picks).filter((id) => {
				const obj = store.get(id);
				return !!obj && isEditable(obj);
			});
			if (targets.length === 0) return null;
			const id = targets[0];
			const obj = store.get(id) as TextObject | StickyNoteObject;
			const before = { content: obj.content, transform: { ...obj.transform } };
			const content = `${obj.content}x`;
			const box = fitContentBox(obj, content);
			const after = { content, transform: { ...obj.transform, width: box.width, height: box.height } };
			return new UpdateContentCommand(store, id, before, after);
		}

		case 'reorder': {
			if (ids.length < 2) return null;
			const before = new Map(store.getAll().map((o) => [o.id, o.zIndex ?? 0]));
			const shift = op.shift % ids.length;
			const shifted = [...ids.slice(shift), ...ids.slice(0, shift)];
			const after = new Map(shifted.map((id, i) => [id, i]));
			return new ReorderCommand(store, before, after);
		}

		case 'group': {
			const targets = resolveIds(store, op.picks);
			const childIds = targets.length > 0 ? targets : ids.slice(0, 1);
			if (childIds.length === 0) return null;
			return new GroupCommand(store, childIds);
		}

		case 'ungroup': {
			const group = store.getAll().find((o) => o.type === 'group');
			if (group) return new UngroupCommand(store, group.id);
			return new GroupCommand(store, ids.slice(0, 1));
		}

		case 'batch': {
			const sub: Command[] = [];
			const style = buildCommand(store, { kind: 'style', picks: [0], opacity: op.opacity });
			if (style) sub.push(style);
			const reorder = buildCommand(store, { kind: 'reorder', shift: op.shift });
			if (reorder) sub.push(reorder);
			return sub.length > 0 ? new BatchCommand(sub, 'Batch') : null;
		}
	}
}

describe('commands — invariants (fast-check)', () => {
	it('undo(redo(s)) ≡ s and redo(undo(redo(s))) ≡ redo(s) for every command', () => {
		fc.assert(
			fc.property(
				fc.array(fc.nat({ max: 4 }), { minLength: 1, maxLength: 4 }),
				fc.array(opArb, { maxLength: 4 }),
				(kinds, ops) => {
					const store = new ObjectStore();
					const history = new HistoryManager();
					const list = kinds.some((k) => k === 1 || k === 2) ? kinds : [...kinds, 1];
					const objects = list.map((k, i) => makeObject(k, i));
					store.addMany(objects);

					const run = (cmd: Command) => {
						const s0 = snapshot(store);
						history.execute(cmd);
						const s1 = snapshot(store);
						history.undo();
						expect(snapshot(store)).toEqual(s0); // undo(redo(s)) ≡ s
						history.redo();
						expect(snapshot(store)).toEqual(s1); // redo(undo(redo(s))) ≡ redo(s)
						history.undo();
						expect(snapshot(store)).toEqual(s0);
						history.redo(); // leave applied for the next op
					};

					// exercises GroupCommand on a real selection first
					run(
						new GroupCommand(
							store,
							objects.slice(0, Math.max(1, Math.floor(objects.length / 2))).map((o) => o.id)
						)
					);

					for (const op of ops) {
						const cmd = buildCommand(store, op);
						if (cmd) run(cmd);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});
