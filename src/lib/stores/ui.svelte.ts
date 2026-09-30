// UI store — shared shell state (Svelte 5 runes, module-level).
// Lets TopBar (in the layout) drive actions that live inside BoardCanvas.

export const ui = $state({
	boardName: 'Inkboard',
	saveState: 'idle' as 'idle' | 'saving' | 'saved',
	canUndo: false,
	canRedo: false
});

export const uiActions = $state({
	undo: undefined as (() => void) | undefined,
	redo: undefined as (() => void) | undefined,
	rename: undefined as ((name: string) => void) | undefined,
	openSettings: undefined as (() => void) | undefined,
	share: undefined as (() => void) | undefined,
	back: undefined as (() => void) | undefined
});

/** Reset shell state when the board unmounts (B14) — Home must not inherit it. */
export function resetUi(): void {
	ui.boardName = 'Inkboard';
	ui.saveState = 'idle';
	ui.canUndo = false;
	ui.canRedo = false;
	uiActions.undo = undefined;
	uiActions.redo = undefined;
	uiActions.rename = undefined;
	uiActions.openSettings = undefined;
	uiActions.share = undefined;
	uiActions.back = undefined;
}
