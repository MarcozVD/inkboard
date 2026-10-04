// autosaveSerializer — board → JSON without blocking the main thread (M3-06).
// Large boards are serialized in a module worker; small ones stay inline to
// avoid the postMessage overhead. Falls back to sync serialization when the
// worker is unavailable (SSR, tests, restricted webviews).
import { serializeBoard } from '$lib/io/InternalFormat';
import type { Board } from '$lib/objects/types';

/** Boards with fewer objects serialize inline (postMessage would cost more). */
export const WORKER_OBJECT_THRESHOLD = 500;

interface Pending {
	resolve: (json: string) => void;
	reject: (error: unknown) => void;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 0;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker | null {
	if (workerBroken || typeof Worker === 'undefined') return null;
	if (worker) return worker;
	try {
		worker = new Worker(new URL('./autosave.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (event: MessageEvent<{ id: number; json?: string; error?: string }>) => {
			const entry = pending.get(event.data.id);
			if (!entry) return;
			pending.delete(event.data.id);
			if (event.data.error) entry.reject(new Error(event.data.error));
			else entry.resolve(event.data.json ?? '');
		};
		worker.onerror = () => {
			// fail pending saves; the next save retries with the sync fallback
			workerBroken = true;
			for (const entry of pending.values()) entry.reject(new Error('autosave worker failed'));
			pending.clear();
			worker?.terminate();
			worker = null;
		};
	} catch {
		workerBroken = true;
		worker = null;
	}
	return worker;
}

/** Test seam: drop the worker so state does not leak between tests. */
export function resetAutosaveSerializerForTests(): void {
	worker?.terminate();
	worker = null;
	workerBroken = false;
	pending.clear();
}

/** Serialize a board; large boards go through a worker when available. */
export function serializeBoardAsync(board: Board): Promise<string> {
	const activeWorker = board.objects.length >= WORKER_OBJECT_THRESHOLD ? ensureWorker() : null;
	if (!activeWorker) return Promise.resolve(serializeBoard(board));
	return new Promise<string>((resolve, reject) => {
		const id = nextId++;
		pending.set(id, { resolve, reject });
		try {
			activeWorker.postMessage({ id, board });
		} catch {
			// non-cloneable payload (e.g. a stray reactive proxy) → sync fallback
			pending.delete(id);
			resolve(serializeBoard(board));
		}
	});
}
