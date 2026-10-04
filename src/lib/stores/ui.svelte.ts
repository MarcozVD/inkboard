// UI store — shared shell state (Svelte 5 runes, module-level).
// Lets TopBar (in the layout) drive actions that live inside BoardCanvas.

export const ui = $state({
	boardName: 'Inkboard',
	saveState: 'idle' as 'idle' | 'saving' | 'saved',
	canUndo: false,
	canRedo: false,
	/** transient message (M2-11 honest import scope) */
	notice: null as string | null
});

export const uiActions = $state({
	undo: undefined as (() => void) | undefined,
	redo: undefined as (() => void) | undefined,
	rename: undefined as ((name: string) => void) | undefined,
	openSettings: undefined as (() => void) | undefined,
	share: undefined as (() => void) | undefined,
	back: undefined as (() => void) | undefined
});

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

/** Show a transient banner (M2-11 honest import scope and future notices). */
export function showNotice(message: string, ms = 4500): void {
	ui.notice = message;
	if (noticeTimer) clearTimeout(noticeTimer);
	noticeTimer = setTimeout(() => {
		ui.notice = null;
		noticeTimer = null;
	}, ms);
}

/** Reset shell state when the board unmounts (B14) — Home must not inherit it. */
export function resetUi(): void {
	ui.boardName = 'Inkboard';
	ui.saveState = 'idle';
	ui.canUndo = false;
	ui.canRedo = false;
	ui.notice = null;
	uiActions.undo = undefined;
	uiActions.redo = undefined;
	uiActions.rename = undefined;
	uiActions.openSettings = undefined;
	uiActions.share = undefined;
	uiActions.back = undefined;
	if (noticeTimer) {
		clearTimeout(noticeTimer);
		noticeTimer = null;
	}
}
