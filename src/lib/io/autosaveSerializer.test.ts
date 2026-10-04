import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetAutosaveSerializerForTests, serializeBoardAsync, WORKER_OBJECT_THRESHOLD } from './autosaveSerializer';
import { serializeBoard } from './InternalFormat';
import { freshBoard } from './persistence';
import { createShape } from '$lib/objects/factory';
import type { Board } from '$lib/objects/types';

function boardWith(count: number): Board {
	const board = freshBoard('bench');
	board.objects = Array.from({ length: count }, (_, i) => createShape(i * 20, i * 20, 10, 10, 'rect'));
	return board;
}

describe('serializeBoardAsync (M3-06)', () => {
	afterEach(() => {
		resetAutosaveSerializerForTests();
		vi.unstubAllGlobals();
	});

	it('serializes small boards inline without touching a Worker', async () => {
		const spy = vi.fn();
		vi.stubGlobal('Worker', spy);
		const board = boardWith(3);
		expect(await serializeBoardAsync(board)).toBe(serializeBoard(board));
		expect(spy).not.toHaveBeenCalled();
	});

	it('uses the worker for large boards and returns its JSON', async () => {
		class FakeWorker {
			onmessage: ((event: { data: unknown }) => void) | null = null;
			onerror: (() => void) | null = null;
			constructor(..._args: unknown[]) {}
			postMessage(message: { id: number; board: Board }): void {
				const json = serializeBoard(message.board);
				queueMicrotask(() => this.onmessage?.({ data: { id: message.id, json } }));
			}
			terminate(): void {}
		}
		vi.stubGlobal('Worker', FakeWorker);
		const board = boardWith(WORKER_OBJECT_THRESHOLD);
		expect(await serializeBoardAsync(board)).toBe(serializeBoard(board));
	});

	it('rejects pending saves when the worker errors (next save falls back)', async () => {
		class BrokenWorker {
			onmessage: ((event: { data: unknown }) => void) | null = null;
			onerror: (() => void) | null = null;
			constructor(..._args: unknown[]) {}
			postMessage(): void {
				queueMicrotask(() => this.onerror?.());
			}
			terminate(): void {}
		}
		vi.stubGlobal('Worker', BrokenWorker);
		await expect(serializeBoardAsync(boardWith(WORKER_OBJECT_THRESHOLD))).rejects.toThrow(/worker failed/);
		// the broken worker is dropped: the next call uses the sync fallback
		const small = boardWith(3);
		expect(await serializeBoardAsync(small)).toBe(serializeBoard(small));
	});
});
