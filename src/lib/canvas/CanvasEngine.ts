// Canvas engine — orchestrates store + tools + render (§4, §20)
import { ObjectStore } from '$lib/canvas/ObjectStore';
import { SelectTool } from '$lib/tools/SelectTool';
import { PenTool } from '$lib/tools/PenTool';
import { HighlighterTool } from '$lib/tools/HighlighterTool';
import { EraserTool } from '$lib/tools/EraserTool';
import { TextTool } from '$lib/tools/TextTool';
import { ShapeTool } from '$lib/tools/ShapeTool';
import { ImageTool } from '$lib/tools/ImageTool';
import { StickyNoteTool } from '$lib/tools/StickyNoteTool';
import { ConnectorTool } from '$lib/tools/ConnectorTool';
import type { BaseTool } from '$lib/tools/BaseTool';
import type { CameraState } from '$lib/canvas/Camera';
import { HistoryManager, type Command } from '$lib/canvas/HistoryManager';
import { dropLastAddCommand } from '$lib/canvas/commands';
import type { CanvasObject, GridConfig } from '$lib/objects/types';

export type ToolId = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'sticky' | 'shape' | 'image' | 'connector';

export class CanvasEngine {
	readonly store = new ObjectStore();
	readonly history = new HistoryManager(200);
	private cameraFn: () => CameraState;
	private onDirty: () => void;
	private onGestureEnd: () => void;

	private tools = new Map<ToolId, BaseTool>();
	private _activeTool: ToolId = 'select';
	private _liveObjectId: string | null = null;

	readonly selectTool: SelectTool;
	readonly textTool: TextTool;
	readonly shapeTool: ShapeTool;
	readonly imageTool: ImageTool;
	readonly stickyTool: StickyNoteTool;
	readonly connectorTool: ConnectorTool;

	constructor(opts: {
		camera: () => CameraState;
		onDirty: () => void;
		onGestureEnd?: () => void;
		grid?: () => GridConfig;
	}) {
		this.cameraFn = opts.camera;
		this.onDirty = opts.onDirty;
		this.onGestureEnd = opts.onGestureEnd ?? opts.onDirty;

		const ctx = {
			store: this.store,
			camera: this.cameraFn,
			onDirty: this.onDirty,
			onGestureEnd: this.onGestureEnd,
			execute: (cmd: Command) => this.execute(cmd),
			discardAdded: (id: string) => this.discardAdded(id),
			grid: opts.grid,
			setLiveObject: (id: string | null) => {
				this._liveObjectId = id;
			}
		};

		this.selectTool = new SelectTool(ctx);
		this.textTool = new TextTool(ctx);
		this.shapeTool = new ShapeTool(ctx);
		this.imageTool = new ImageTool(ctx);
		this.stickyTool = new StickyNoteTool(ctx);
		this.connectorTool = new ConnectorTool(ctx);
		this.tools.set('select', this.selectTool);
		this.tools.set('pen', new PenTool(ctx));
		this.tools.set('highlighter', new HighlighterTool(ctx));
		this.tools.set('eraser', new EraserTool(ctx));
		this.tools.set('text', this.textTool);
		this.tools.set('shape', this.shapeTool);
		this.tools.set('image', this.imageTool);
		this.tools.set('sticky', this.stickyTool);
		this.tools.set('connector', this.connectorTool);
	}

	get activeTool(): ToolId {
		return this._activeTool;
	}

	/** Object being drawn right now (M3-02 static layer), if any. */
	get liveObjectId(): string | null {
		return this._liveObjectId;
	}

	/** Activate a tool. Returns false when the tool is not implemented (B10). */
	setTool(tool: ToolId): boolean {
		const next = this.tools.get(tool);
		if (!next) return false; // tool not implemented yet
		this.tools.get(this._activeTool)?.reset();
		this._activeTool = tool;
		this.onDirty();
		return true;
	}

	get tool(): BaseTool {
		return this.tools.get(this._activeTool)!;
	}

	// ── Single mutation API (§M1-02) ──

	/** Execute a command: applies it and records it in the history. */
	execute(command: Command): void {
		this.history.execute(command);
	}

	/** Remove an object and drop its creation step (discarded drafts). */
	discardAdded(id: string): void {
		this.store.remove(id);
		dropLastAddCommand(this.history, id);
	}

	/** Replace all objects (board load — not an undoable mutation). */
	load(objects: CanvasObject[]): void {
		if (objects.length === 0) return;
		this.store.clear();
		this.store.addMany(objects);
		this.history.clear();
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
