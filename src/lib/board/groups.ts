// groups — group selection logic (§M1-05, RF-12). One nesting level.
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { ObjectStore } from '$lib/canvas/ObjectStore';
import type { Command } from '$lib/canvas/HistoryManager';
import { BatchCommand, GroupCommand, UngroupCommand } from '$lib/canvas/commands';

/** Ids of the objects tagged with a group id. */
export function groupMembers(store: ObjectStore, groupId: string): string[] {
	return store
		.getAll()
		.filter((obj) => obj.groupId === groupId)
		.map((obj) => obj.id);
}

/** Resolve group shells and members to the concrete objects an action applies to. */
export function expandSelection(store: ObjectStore, ids: string[]): string[] {
	const out = new Set<string>();
	for (const id of ids) {
		const obj = store.get(id);
		if (!obj) continue;
		if (obj.type === 'group') {
			for (const childId of obj.childIds) {
				if (store.get(childId)) out.add(childId);
			}
		} else if (obj.groupId) {
			for (const memberId of groupMembers(store, obj.groupId)) out.add(memberId);
		} else {
			out.add(id);
		}
	}
	return [...out];
}

/** Group the selection as one undo step (re-parenting from older groups). */
export function groupSelection(engine: CanvasEngine): boolean {
	const store = engine.store;
	const members = expandSelection(store, engine.selectionManager.selected);
	if (members.length < 2) return false;

	const parents = new Set<string>();
	for (const id of members) {
		const groupId = store.get(id)?.groupId;
		if (groupId) parents.add(groupId);
	}
	const commands: Command[] = [...parents].map((groupId) => new UngroupCommand(store, groupId));
	commands.push(new GroupCommand(store, members));
	engine.execute(commands.length > 1 ? new BatchCommand(commands, 'Group') : commands[0]);
	engine.selectionManager.selectMany(members);
	return true;
}

/** Dissolve every group touched by the selection as one undo step. */
export function ungroupSelection(engine: CanvasEngine): boolean {
	const store = engine.store;
	const members = expandSelection(store, engine.selectionManager.selected);
	const groups = new Set<string>();
	for (const id of members) {
		const groupId = store.get(id)?.groupId;
		if (groupId) groups.add(groupId);
	}
	if (groups.size === 0) return false;

	const commands = [...groups].map((groupId) => new UngroupCommand(store, groupId));
	engine.execute(commands.length > 1 ? new BatchCommand(commands, 'Ungroup') : commands[0]);
	return true;
}

export interface DoubleClickAction {
	kind: 'group' | 'text';
	objectId: string;
}

/** Resolve what a double click on the canvas should do (group entry or text edit). */
export function resolveDoubleClick(engine: CanvasEngine, world: { x: number; y: number }): DoubleClickAction | null {
	const hit = engine.selectionManager.hitTest(world);
	if (!hit) return null;
	if (hit.groupId) return { kind: 'group', objectId: hit.id };
	if (hit.type === 'text' || hit.type === 'sticky_note') return { kind: 'text', objectId: hit.id };
	return null;
}
