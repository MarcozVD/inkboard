// styleBridge — reactive bridge between the canvas styles and the toolbars (§M1-03).
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { updateStyles } from '$lib/canvas/commands';
import { stickyNoteColors } from '$lib/objects/renderers';
import type { CanvasObject } from '$lib/objects/types';
import { buildSelectionStyleControls, buildToolStyleControls, type StyleControl } from './styleControls';

export interface StyleBridgeDeps {
	getEngine: () => CanvasEngine | null;
	onDirty: () => void;
}

export function createStyleBridge(deps: StyleBridgeDeps) {
	// bumping this invalidates both control lists (tool configs are not reactive)
	let version = $state(0);
	const touch = () => {
		version++;
		deps.onDirty();
	};

	/** Remember the last style per tool so the next object uses it. */
	function syncToolConfig(engine: CanvasEngine, patch: Record<string, unknown>): void {
		const objs = engine.selectionManager.selected.map((id) => engine.store.get(id)).filter(Boolean) as CanvasObject[];
		if (objs.length === 0) return;
		const only = (type: CanvasObject['type']) => objs.every((o) => o.type === type);

		if (only('stroke')) {
			const first = objs[0];
			const cfg = first.type === 'stroke' && first.style.isHighlighter ? engine.highlighterConfig : engine.penConfig;
			if (typeof patch.color === 'string') cfg.color = patch.color;
			if (typeof patch.width === 'number') cfg.width = patch.width;
		} else if (only('shape')) {
			Object.assign(engine.shapeTool.config.style, patch);
		} else if (only('text')) {
			Object.assign(engine.textTool.config, patch);
		} else if (only('connector')) {
			Object.assign(engine.connectorTool.config, patch);
		} else if (only('sticky_note')) {
			const index = stickyNoteColors().indexOf(String(patch.backgroundColor));
			if (index >= 0) engine.stickyTool.setColor(index);
		}
	}

	const applySelectionPatch = (patch: Record<string, unknown>) => {
		const engine = deps.getEngine();
		if (!engine) return;
		updateStyles(engine, engine.selectionManager.selected, patch);
		syncToolConfig(engine, patch);
		touch();
	};

	const selectionControls = $derived.by<StyleControl[]>(() => {
		void version;
		const engine = deps.getEngine();
		return engine ? buildSelectionStyleControls(engine, applySelectionPatch) : [];
	});

	const toolControls = $derived.by<StyleControl[]>(() => {
		void version;
		const engine = deps.getEngine();
		return engine ? buildToolStyleControls(engine, touch) : [];
	});

	return {
		applySelectionPatch,
		touch,
		get selectionControls(): StyleControl[] {
			return selectionControls;
		},
		get toolControls(): StyleControl[] {
			return toolControls;
		}
	};
}
