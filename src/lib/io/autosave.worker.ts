// autosave worker — serializes large boards off the main thread (M3-06).
import { serializeBoard } from '$lib/io/InternalFormat';
import type { Board } from '$lib/objects/types';

self.onmessage = (event: MessageEvent<{ id: number; board: Board }>) => {
	try {
		const json = serializeBoard(event.data.board);
		postMessage({ id: event.data.id, json });
	} catch (err) {
		postMessage({ id: event.data.id, error: err instanceof Error ? err.message : String(err) });
	}
};
