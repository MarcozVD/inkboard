// BoardSession — load, autosave, forced save and flush (§M1-01, B05/B17).
import { loadBoard, saveBoard } from '$lib/io/persistence';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { Board, CameraState, GridConfig } from '$lib/objects/types';

export type SaveState = 'idle' | 'saving' | 'saved';

export interface BoardSessionOptions {
	boardId: string;
	engine: CanvasEngine;
	/** current component state needed to build the persisted board */
	getSnapshot: () => { name: string; camera: CameraState; grid: GridConfig };
	onSaveState?: (state: SaveState) => void;
	/** debounce before an autosave fires (default 2 s) */
	debounceMs?: number;
	/** interval for the forced save during continuous editing (default 30 s) */
	forceSaveMs?: number;
}

export class BoardSession {
	/** preserved from the loaded board (B17) */
	boardCreatedAt = Date.now();
	saveState: SaveState = 'idle';

	private readonly debounceMs: number;
	private readonly forceSaveMs: number;
	private hasPendingSave = false;
	private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	private forceTimer: ReturnType<typeof setInterval> | null = null;
	private destroyed = false;

	constructor(private opts: BoardSessionOptions) {
		this.debounceMs = opts.debounceMs ?? 2000;
		this.forceSaveMs = opts.forceSaveMs ?? 30_000;
	}

	async load(): Promise<Board> {
		const board = await loadBoard(this.opts.boardId);
		this.boardCreatedAt = board.createdAt ?? Date.now();
		return board;
	}

	buildBoard(): Board {
		const { name, camera, grid } = this.opts.getSnapshot();
		return {
			id: this.opts.boardId,
			workspaceId: 'default',
			name,
			version: 1,
			schemaVersion: '1.0.0',
			createdAt: this.boardCreatedAt,
			updatedAt: Date.now(),
			camera,
			objects: this.opts.engine.store.toJSON(),
			background: { type: 'solid', color: '#0f1013' },
			grid,
			metadata: {}
		};
	}

	/** Persist the current board immediately. */
	async saveNow(): Promise<void> {
		this.hasPendingSave = false;
		this.setSaveState('saving');
		try {
			await saveBoard(this.buildBoard());
			this.setSaveState('saved');
		} catch (err) {
			console.error('autosave failed', err);
			this.hasPendingSave = true;
			this.setSaveState('idle');
		}
	}

	/**
	 * Save now, cancelling the pending debounce. Used on unmount, pagehide,
	 * visibilitychange, before goto('/') and on window close (B05).
	 */
	flushSave(): Promise<void> {
		if (this.autosaveTimer) {
			clearTimeout(this.autosaveTimer);
			this.autosaveTimer = null;
		}
		if (!this.hasPendingSave) return Promise.resolve();
		return this.saveNow();
	}

	scheduleAutosave(): void {
		if (this.destroyed) return;
		this.hasPendingSave = true;
		if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
		this.autosaveTimer = setTimeout(() => {
			this.autosaveTimer = null;
			void this.saveNow();
		}, this.debounceMs);
	}

	/** Force a save every `forceSaveMs` while edits keep resetting the debounce. */
	startForceSave(): void {
		if (this.forceTimer) return;
		this.forceTimer = setInterval(() => {
			if (this.hasPendingSave) void this.saveNow();
		}, this.forceSaveMs);
	}

	dispose(): void {
		this.destroyed = true;
		if (this.autosaveTimer) {
			clearTimeout(this.autosaveTimer);
			this.autosaveTimer = null;
		}
		if (this.forceTimer) {
			clearInterval(this.forceTimer);
			this.forceTimer = null;
		}
	}

	get pending(): boolean {
		return this.hasPendingSave;
	}

	private setSaveState(state: SaveState): void {
		this.saveState = state;
		if (!this.destroyed) this.opts.onSaveState?.(state);
	}
}
