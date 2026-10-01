// lock — lock/unlock logic (§M1-06, RF-02).
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { UpdateLockCommand } from '$lib/canvas/commands';
import { expandSelection } from './groups';

/** Lock every selected object, or unlock the selection when it is fully locked. */
export function toggleLockSelection(engine: CanvasEngine): boolean {
	const store = engine.store;
	const ids = expandSelection(store, engine.selectionManager.selected);
	if (ids.length === 0) return false;

	const before = new Map<string, boolean>();
	const after = new Map<string, boolean>();
	const locking = ids.some((id) => !store.get(id)?.locked);

	for (const id of ids) {
		const obj = store.get(id);
		if (!obj) continue;
		before.set(id, obj.locked);
		after.set(id, locking);
	}
	if (before.size === 0) return false;
	engine.execute(new UpdateLockCommand(store, before, after));
	return true;
}
