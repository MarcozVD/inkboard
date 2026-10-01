// nudge — arrow-key movement of the selection (§M1-07), one undo step per key.
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { captureGeometry, translateObject, type GeometrySnapshot } from '$lib/objects/geometry';
import { UpdateTransformCommand } from '$lib/canvas/commands';
import { expandSelection } from './groups';

export function nudgeSelection(engine: CanvasEngine, dx: number, dy: number): boolean {
	const store = engine.store;
	const ids = expandSelection(store, engine.selectionManager.selected).filter(
		(id) => !store.get(id)?.locked
	);
	if (ids.length === 0) return false;

	const before = new Map<string, GeometrySnapshot>();
	const after = new Map<string, GeometrySnapshot>();
	for (const id of ids) {
		const obj = store.get(id);
		if (!obj) continue;
		before.set(id, captureGeometry(obj));
		const moved = structuredClone(obj);
		translateObject(moved, dx, dy);
		after.set(id, captureGeometry(moved));
	}
	if (before.size === 0) return false;
	engine.execute(new UpdateTransformCommand(store, before, after));
	return true;
}
