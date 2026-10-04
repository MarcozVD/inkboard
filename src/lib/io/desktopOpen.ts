// desktopOpen — boards opened from argv / a second instance and the logs
// folder (M4-03/M4-04). Rust owns the paths; the webview only receives ids.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const OPEN_BOARD_EVENT = 'inkboard:open-board';

export function isTauriRuntime(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface DesktopOpenDeps {
	isTauri?: () => boolean;
	takePendingOpens?: () => Promise<string[]>;
	listenOpen?: (handler: (boardId: string) => void) => Promise<() => void>;
	navigate: (boardId: string) => void;
}

/**
 * Navigate to boards opened via file association or a second instance.
 * Pending ids (startup) are drained first, then live events are followed.
 * Returns an unsubscribe function.
 */
export async function wireDesktopOpen(deps: DesktopOpenDeps): Promise<() => void> {
	const isTauri = deps.isTauri ?? isTauriRuntime;
	if (!isTauri()) return () => {};
	const takePending = deps.takePendingOpens ?? (() => invoke<string[]>('take_pending_opens'));
	const listenOpen =
		deps.listenOpen ?? ((handler) => listen<string>(OPEN_BOARD_EVENT, (event) => handler(event.payload)));
	const pending = await takePending();
	for (const boardId of pending) deps.navigate(boardId);
	return listenOpen((boardId) => deps.navigate(boardId));
}

/** Open the app log directory in the OS file manager (M4-04). */
export async function openLogsFolder(): Promise<void> {
	if (!isTauriRuntime()) return;
	await invoke('open_logs_dir');
}
