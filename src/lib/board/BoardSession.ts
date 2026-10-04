// BoardSession — load, autosave, forced save and flush (§M1-01, B05/B17).
// M3-06: a content revision acts as dirty flag (no serialize/send when nothing
// changed) and serialization runs through an injectable (optionally off-thread)
// serializer so a 5k board does not block the main thread.
import { loadBoard, saveBoardJson } from '$lib/io/persistence';
import { SCHEMA_VERSION } from '$lib/io/InternalFormat';
import { serializeBoardAsync } from '$lib/io/autosaveSerializer';
import { profileNow, renderProfile } from '$lib/canvas/renderProfile';
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
	/** board → JSON string (defaults to the possibly off-thread serializer) */
	serialize?: (board: Board) => Promise<string>;
}

export class BoardSession {
	/** preserved from the loaded board (B17) */
	boardCreatedAt = Date.now();
	saveState: SaveState = 'idle';

	private readonly debounceMs: number;
	private readonly forceSaveMs: number;
	private readonly serialize: (board: Board) => Promise<string>;
	private hasPendingSave = false;
	/** content revision of the last successful save (M3-06 dirty flag) */
	private savedRevision = -1;
	private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	private forceTimer: ReturnType<typeof setInterval> | null = null;
	private destroyed = false;

	constructor(private opts: BoardSessionOptions) {
		this.debounceMs = opts.debounceMs ?? 2000;
		this.forceSaveMs = opts.forceSaveMs ?? 30_000;
		this.serialize = opts.serialize ?? serializeBoardAsync;
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
			schemaVersion: SCHEMA_VERSION,
			createdAt: this.boardCreatedAt,
			updatedAt: Date.now(),
			// plain copies: Svelte $state proxies are not structured-cloneable (M3-06)
			camera: { ...camera },
			objects: this.opts.engine.store.toJSON(),
			background: { type: 'solid', color: '#0f1013' },
			grid: { ...grid },
			metadata: {}
		};
	}

	/** Persist the current board immediately (no-op when clean, M3-06). */
	async saveNow(): Promise<void> {
		const engine = this.opts.engine;
		const revision = engine.store.revision;
		if (!this.hasPendingSave && revision === this.savedRevision) return;
		this.hasPendingSave = false;
		this.setSaveState('saving');
		const tBuild = profileNow();
		const board = this.buildBoard();
		if (renderProfile.enabled) renderProfile.add('save:build', profileNow() - tBuild);
		try {
			const tSerialize = profileNow();
			const json = await this.serialize(board);
			if (renderProfile.enabled) renderProfile.add('save:serialize', profileNow() - tSerialize);
			const tPersist = profileNow();
			await saveBoardJson(board.id, board.name || 'Untitled', json);
			if (renderProfile.enabled) renderProfile.add('save:persist', profileNow() - tPersist);
			this.savedRevision = revision;
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
