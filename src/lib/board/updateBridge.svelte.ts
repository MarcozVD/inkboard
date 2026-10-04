// updateBridge — updater UI flow (M4-05, D4: unsigned beta).
// The Tauri plugins are resolved lazily; tests/E2E can inject a mock bridge
// through `window.__updaterMock`.
import { isTauriRuntime } from '$lib/io/desktopOpen';
import { showNotice } from '$lib/stores/ui.svelte';

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'installing' | 'error';

export interface UpdateHandle {
	version: string;
	downloadAndInstall: (onProgress?: (progress: { percent: number | null }) => void) => Promise<void>;
}

export interface UpdaterBridge {
	check: () => Promise<UpdateHandle | null>;
	relaunch: () => Promise<void>;
	/** user confirmation before install; defaults to window.confirm */
	confirm?: (message: string) => boolean;
}

/** Resolve the bridge: explicit override > global mock > Tauri plugin > none. */
export function resolveUpdaterBridge(overrides?: UpdaterBridge | null): UpdaterBridge | null {
	if (overrides !== undefined) return overrides;
	const mock = (globalThis as { __updaterMock?: UpdaterBridge }).__updaterMock;
	if (mock) return mock;
	if (!isTauriRuntime()) return null;
	return {
		check: async () => {
			const { check } = await import('@tauri-apps/plugin-updater');
			const update = await check();
			if (!update) return null;
			return {
				version: update.version,
				downloadAndInstall: async (onProgress) => {
					let downloaded = 0;
					let total = 0;
					await update.downloadAndInstall((event) => {
						if (event.event === 'Started') {
							total = event.data.contentLength ?? 0;
							return;
						}
						if (event.event !== 'Progress') return;
						downloaded += event.data.chunkLength;
						onProgress?.({ percent: total > 0 ? Math.round((downloaded / total) * 100) : null });
					});
				}
			};
		},
		relaunch: async () => {
			const { relaunch } = await import('@tauri-apps/plugin-process');
			await relaunch();
		}
	};
}

export function createUpdater(bridge: UpdaterBridge | null) {
	let status = $state<UpdateStatus>('idle');
	let version = $state<string | null>(null);
	let error = $state<string | null>(null);
	let percent = $state<number | null>(null);
	let handle: UpdateHandle | null = null;

	async function check(silent = false): Promise<void> {
		if (!bridge) {
			if (!silent) {
				status = 'error';
				error = 'Updates are only available in the desktop app.';
			}
			return;
		}
		status = 'checking';
		error = null;
		try {
			handle = await bridge.check();
			if (!handle) {
				status = 'up-to-date';
				return;
			}
			version = handle.version;
			status = 'available';
			if (silent) {
				showNotice(`Inkboard ${handle.version} is available — open Settings → About to install.`);
			}
		} catch (err) {
			status = 'error';
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function install(): Promise<void> {
		if (!bridge || !handle) return;
		const confirm = bridge.confirm ?? ((message: string) => window.confirm(message));
		if (!confirm(`Install Inkboard ${handle.version} and restart the app?`)) return;
		status = 'downloading';
		error = null;
		percent = null;
		try {
			await handle.downloadAndInstall((progress) => {
				percent = progress.percent;
			});
			status = 'installing';
			await bridge.relaunch();
		} catch (err) {
			status = 'error';
			error = err instanceof Error ? err.message : String(err);
		}
	}

	return {
		get enabled(): boolean {
			return bridge !== null;
		},
		get status(): UpdateStatus {
			return status;
		},
		get version(): string | null {
			return version;
		},
		get error(): string | null {
			return error;
		},
		get percent(): number | null {
			return percent;
		},
		check,
		install
	};
}

export const updater = createUpdater(resolveUpdaterBridge());
