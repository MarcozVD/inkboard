// textEditing — in-canvas editor state (§M1-01 extraction, used by BoardCanvas).
import { cancelTextContent, commitTextContent } from '$lib/canvas/commands';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { EditableObj } from '$lib/objects/types';

export interface TextEditingDeps {
	getEngine: () => CanvasEngine | null;
	onShellChange: () => void;
	onDirty: () => void;
}

export function createTextEditing(deps: TextEditingDeps) {
	let editingId = $state<string | null>(null);

	const editingObj = $derived.by(() => {
		const engine = deps.getEngine();
		if (!engine || !editingId) return null;
		return (engine.store.get(editingId) as unknown as EditableObj) ?? null;
	});

	const open = (obj: EditableObj) => (editingId = obj.id);
	const close = () => (editingId = null);

	const commit = (content: string) => {
		const id = editingId;
		editingId = null;
		const engine = deps.getEngine();
		if (engine && id) commitTextContent(engine, id, content);
		deps.onShellChange();
		deps.onDirty();
	};

	const cancel = () => {
		const id = editingId;
		editingId = null;
		const engine = deps.getEngine();
		if (engine && id) cancelTextContent(engine, id);
		deps.onShellChange();
		deps.onDirty();
	};

	return {
		get editingId(): string | null {
			return editingId;
		},
		get editingObj(): EditableObj | null {
			return editingObj;
		},
		open,
		close,
		commit,
		cancel
	};
}
