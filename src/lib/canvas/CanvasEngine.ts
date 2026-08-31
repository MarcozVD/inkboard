// Canvas engine — orchestrates store + tools + render (§4, §20)
import { ObjectStore } from '$lib/canvas/ObjectStore';
import { SelectTool } from '$lib/tools/SelectTool';
import { PenTool } from '$lib/tools/PenTool';
import { HighlighterTool } from '$lib/tools/HighlighterTool';
import { EraserTool } from '$lib/tools/EraserTool';
import type { BaseTool } from '$lib/tools/BaseTool';
import type { CameraState } from '$lib/canvas/Camera';

export type ToolId = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'sticky' | 'shape' | 'image' | 'connector';

export class CanvasEngine {
	readonly store = new ObjectStore();
	private cameraFn: () => CameraState;
	private onDirty: () => void;
	private onGestureEnd: () => void;

	private tools = new Map<ToolId, BaseTool>();
	private _activeTool: ToolId = 'select';

	readonly selectTool: SelectTool;

	constructor(opts: { camera: () => CameraState; onDirty: () => void; onGestureEnd?: () => void }) {
		this.cameraFn = opts.camera;
		this.onDirty = opts.onDirty;
		this.onGestureEnd = opts.onGestureEnd ?? opts.onDirty;

		const ctx = {
			store: this.store,
			camera: this.cameraFn,
			onDirty: this.onDirty,
			onGestureEnd: this.onGestureEnd
		};

		this.selectTool = new SelectTool(this.store, this.cameraFn, {
			onDirty: this.onDirty,
			onGestureEnd: this.onGestureEnd
		});
		this.tools.set('select', this.selectTool as unknown as BaseTool);
		this.tools.set('pen', new PenTool(ctx));
		this.tools.set('highlighter', new HighlighterTool(ctx));
		this.tools.set('eraser', new EraserTool(ctx));
	}

	get activeTool(): ToolId {
		return this._activeTool;
	}

	setTool(tool: ToolId): void {
		const next = this.tools.get(tool);
		if (!next) return; // tool not implemented yet
		this.tools.get(this._activeTool)?.reset();
		this._activeTool = tool;
		this.onDirty();
	}

	get tool(): BaseTool {
		return this.tools.get(this._activeTool)!;
	}

	// ── Pointer routing ──

	pointerDown(screenX: number, screenY: number, e: { shift: boolean; button: number; pressure: number }): void {
		this.tool.pointerDown({ screenX, screenY, shift: e.shift, button: e.button, pressure: e.pressure });
	}

	pointerMove(screenX: number, screenY: number, e: { shift: boolean; pressure: number }): void {
		this.tool.pointerMove({ screenX, screenY, shift: e.shift, button: 0, pressure: e.pressure });
	}

	pointerUp(e: { button: number; pressure: number }): void {
		this.tool.pointerUp({ screenX: 0, screenY: 0, shift: false, button: e.button, pressure: e.pressure });
	}

	// ── Delegated helpers used by UI ──

	get selectionManager() {
		return this.selectTool.selectionManager;
	}

	get penConfig() {
		return (this.tools.get('pen') as PenTool).config;
	}

	setPenConfig(cfg: Partial<PenTool['config']>) {
		Object.assign((this.tools.get('pen') as PenTool).config, cfg);
	}

	get highlighterConfig() {
		return (this.tools.get('highlighter') as HighlighterTool).config;
	}

	setHighlighterConfig(cfg: Partial<PenTool['config']>) {
		Object.assign((this.tools.get('highlighter') as HighlighterTool).config, cfg);
	}
}
