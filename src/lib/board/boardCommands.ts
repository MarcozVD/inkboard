// boardCommands — small helpers for the BoardCanvas shell wiring.
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';

/** Run an engine command and refresh the shell/renderer afterwards. */
export function runBoardCommand(
	engine: CanvasEngine | null,
	after: () => void,
	command: (engine: CanvasEngine) => void
): void {
	if (!engine) return;
	command(engine);
	after();
}

/** Select every non-group object. */
export function selectAllObjects(engine: CanvasEngine | null): void {
	if (!engine) return;
	engine.selectionManager.selectMany(
		engine.store
			.getAll()
			.filter((object) => object.type !== 'group')
			.map((object) => object.id)
	);
}
