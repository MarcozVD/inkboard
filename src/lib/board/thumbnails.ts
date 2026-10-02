// thumbnails — debounced board thumbnail capture (M2-03).
// Long debounce after the last edit + explicit flush when leaving the board.
import { cssVar, type ResolvedTheme } from '$lib/objects/colors';
import { renderThumbnail } from '$lib/io/thumbnail';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';

export interface ThumbnailSaverDeps {
	getEngine: () => CanvasEngine | null;
	getBoardId: () => string;
	getTheme: () => ResolvedTheme;
	/** persist the data URL (SQLite in Tauri, localStorage in the browser) */
	save: (boardId: string, dataUrl: string) => Promise<void>;
	debounceMs?: number;
}

export const THUMBNAIL_DEBOUNCE_MS = 10_000;

export function createThumbnailSaver(deps: ThumbnailSaverDeps) {
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function capture(): Promise<void> {
		const engine = deps.getEngine();
		if (!engine) return;
		const theme = deps.getTheme();
		const dataUrl = renderThumbnail(engine.store.toJSON(), {
			theme,
			background: cssVar('--color-bg', theme === 'light' ? '#f5f5f7' : '#0f1013')
		});
		if (!dataUrl) return;
		try {
			await deps.save(deps.getBoardId(), dataUrl);
		} catch (err) {
			console.error('thumbnail save failed', err);
		}
	}

	/** 10 s after the last edit (continuous editing keeps postponing it). */
	function schedule(): void {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			void capture();
		}, deps.debounceMs ?? THUMBNAIL_DEBOUNCE_MS);
	}

	/** Capture immediately (leaving the board, page hide, window close). */
	async function flush(): Promise<void> {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		await capture();
	}

	return { schedule, flush };
}
