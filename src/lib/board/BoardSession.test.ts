// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { BoardSession } from './BoardSession';
import { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';
import { loadBoard } from '$lib/io/persistence';
import { serializeBoard } from '$lib/io/InternalFormat';
import { createShape } from '$lib/objects/factory';
import type { Board } from '$lib/objects/types';

const GRID = { enabled: true, size: 32, color: '#2a2d34', opacity: 0.6 };

function makeSession(boardId = 'session-test', serialize?: (board: Board) => Promise<string>) {
	const engine = new CanvasEngine({ camera: () => DEFAULT_CAMERA, onDirty: () => {} });
	const states: string[] = [];
	const session = new BoardSession({
		boardId,
		engine,
		getSnapshot: () => ({ name: 'Test board', camera: DEFAULT_CAMERA, grid: GRID }),
		onSaveState: (s) => states.push(s),
		debounceMs: 5,
		serialize
	});
	return { engine, session, states };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('BoardSession', () => {
	beforeEach(() => localStorage.clear());

	it('loads a fresh board for an unknown id', async () => {
		const { session } = makeSession();
		const board = await session.load();
		expect(board.id).toBe('session-test');
		expect(session.boardCreatedAt).toBe(board.createdAt);
	});

	it('scheduleAutosave persists after the debounce', async () => {
		const { engine, session } = makeSession();
		await session.load();
		engine.store.add(createShape(0, 0, 10, 10, 'rect'));
		session.scheduleAutosave();
		await wait(30);

		const stored = await loadBoard('session-test');
		expect(stored.objects).toHaveLength(1);
		expect(session.saveState).toBe('saved');
	});

	it('flushSave writes immediately and preserves createdAt (B17)', async () => {
		const { engine, session } = makeSession();
		const board = await session.load();
		engine.store.add(createShape(0, 0, 10, 10, 'rect'));
		session.scheduleAutosave();
		await session.flushSave();

		const stored = await loadBoard('session-test');
		expect(stored.objects).toHaveLength(1);
		expect(stored.createdAt).toBe(board.createdAt);

		// a new session keeps the stored createdAt
		const second = makeSession();
		const reloaded = await second.session.load();
		expect(reloaded.createdAt).toBe(board.createdAt);
		second.session.dispose();
	});

	it('skips serialization when the content revision has not changed (M3-06)', async () => {
		const calls: number[] = [];
		const { engine, session } = makeSession('dirty-flag', async (board) => {
			calls.push(engine.store.revision);
			return serializeBoard(board);
		});
		await session.load();

		engine.store.add(createShape(0, 0, 10, 10, 'rect'));
		session.scheduleAutosave();
		await session.flushSave();
		expect(calls).toHaveLength(1);

		// clean save → neither serialization nor persistence runs
		await session.saveNow();
		expect(calls).toHaveLength(1);

		// a new mutation invalidates the dirty flag
		engine.store.add(createShape(40, 40, 10, 10, 'rect'));
		session.scheduleAutosave();
		await session.flushSave();
		expect(calls).toHaveLength(2);
		session.dispose();
	});

	it('reports save state transitions', async () => {
		const { engine, session, states } = makeSession();
		await session.load();
		engine.store.add(createShape(0, 0, 10, 10, 'rect'));
		session.scheduleAutosave();
		await session.flushSave();
		expect(states).toEqual(['saving', 'saved']);
		session.dispose();
	});
});
