// BoardRuntime — wires engine, input, renderer and session for a board (§M1-01).
import { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { InputController } from '$lib/input/InputController';
import { Renderer } from '$lib/canvas/Renderer';
import { RenderLoop } from '$lib/canvas/RenderLoop';
import { BoardSession, type SaveState } from './BoardSession';
import type { CameraState } from '$lib/canvas/Camera';
import type { Board, EditableObj, GridConfig } from '$lib/objects/types';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { resetUi } from '$lib/stores/ui.svelte';

export interface BoardRuntimeHost {
	canvas: () => HTMLCanvasElement | null;
	boardId: string;
	getCamera: () => CameraState;
	setCamera: (camera: CameraState) => void;
	getGrid: () => GridConfig;
	getView: () => { width: number; height: number };
	getBoardName: () => string;
	isSpaceDown: () => boolean;
	onEngine: (engine: CanvasEngine) => void;
	onCanvasRect: (rect: { left: number; top: number; width: number; height: number }) => void;
	onObjectCount: (count: number) => void;
	onBoardLoaded: (board: Board) => void;
	onSaveState: (state: SaveState) => void;
	onDirty: () => void;
	onGestureEnd: () => void;
	onPointerUp: () => void;
	onEditingRequest: (obj: EditableObj) => void;
	onShellChange: () => void;
	onKeyDown: (e: KeyboardEvent) => void;
	onKeyUp: (e: KeyboardEvent) => void;
	onPaste: (e: ClipboardEvent) => void;
}

export class BoardRuntime {
	readonly engine: CanvasEngine;
	readonly session: BoardSession;
	readonly input: InputController;

	private renderer: Renderer;
	private renderLoop: RenderLoop;
	private detachInput: () => void = () => {};
	private unlistenClose: (() => void) | null = null;

	constructor(private host: BoardRuntimeHost) {
		this.engine = new CanvasEngine({
			camera: host.getCamera,
			onDirty: host.onDirty,
			onGestureEnd: host.onGestureEnd
		});
		this.engine.textTool.onEditRequest = host.onEditingRequest;
		this.engine.stickyTool.onEditRequest = (o) => host.onEditingRequest(o as unknown as EditableObj);

		this.input = new InputController({
			canvas: host.canvas,
			isSpaceDown: host.isSpaceDown,
			getCamera: host.getCamera,
			setCamera: host.setCamera,
			onToolPointerDown: (p, e) =>
				this.engine.pointerDown(p.x, p.y, { shift: e.shiftKey, button: e.button, pressure: e.pressure }),
			onToolPointerMove: (p, e) =>
				this.engine.pointerMove(p.x, p.y, { shift: e.shiftKey, pressure: e.pressure }),
			onToolPointerUp: (e) => {
				this.engine.pointerUp({ button: e.button, pressure: e.pressure });
				host.onPointerUp();
			},
			onDirty: host.onDirty,
			onResize: () => host.onCanvasRect({ ...this.input.rect })
		});

		this.renderer = new Renderer({
			canvas: host.canvas,
			engine: () => this.engine,
			camera: host.getCamera,
			grid: host.getGrid,
			dpr: () => this.input.dpr,
			view: host.getView
		});
		this.renderLoop = new RenderLoop(() => this.renderer.render());

		this.session = new BoardSession({
			boardId: host.boardId,
			engine: this.engine,
			getSnapshot: () => ({ name: host.getBoardName(), camera: host.getCamera(), grid: host.getGrid() }),
			onSaveState: host.onSaveState
		});
		host.onEngine(this.engine);
	}

	/** Request a repaint on the next animation frame. */
	markDirty(): void {
		this.renderLoop.markDirty();
	}

	attach(): () => void {
		this.detachInput = this.input.attach();
		this.renderLoop.start();

		this.engine.store.onChange(() => {
			this.host.onObjectCount(this.engine.store.getAll().length);
			this.host.onDirty();
			this.session.scheduleAutosave();
		});
		this.engine.store.onChange(this.host.onShellChange);
		this.session.startForceSave();

		// load existing board (or empty canvas for a fresh one)
		this.session
			.load()
			.then((board: Board) => {
				this.engine.load(board.objects);
				this.host.onBoardLoaded(board);
				this.host.onDirty();
			})
			.catch(() => this.host.onDirty());

		// ── Flush on exit paths (B05) ──
		const onPageHide = () => { void this.session.flushSave(); };
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') void this.session.flushSave();
		};
		if ('__TAURI_INTERNALS__' in window) {
			getCurrentWindow()
				.onCloseRequested(async () => { await this.session.flushSave(); })
				.then((u) => (this.unlistenClose = u))
				.catch(() => {});
		}

		window.addEventListener('keydown', this.host.onKeyDown);
		window.addEventListener('keyup', this.host.onKeyUp);
		window.addEventListener('paste', this.host.onPaste);
		window.addEventListener('pagehide', onPageHide);
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			window.removeEventListener('keydown', this.host.onKeyDown);
			window.removeEventListener('keyup', this.host.onKeyUp);
			window.removeEventListener('paste', this.host.onPaste);
			window.removeEventListener('pagehide', onPageHide);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			this.detachInput();
			this.renderLoop.stop();
		};
	}

	/** Final flush, session teardown and shell reset (B05/B14). */
	dispose(): void {
		void this.session.flushSave();
		this.session.dispose();
		resetUi();
		this.unlistenClose?.();
	}
}
