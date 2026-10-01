// Single source of truth for keyboard shortcuts (§M0-05, fixes B04/B09).
// Consumed by the BoardCanvas keydown, the ToolBar hints and the CommandPalette.
import type { CanvasEngine, ToolId } from '$lib/canvas/CanvasEngine';
import type { ShapeType } from '$lib/objects/types';

export interface ToolShortcut {
	tool: ToolId;
	/** lowercase event.key */
	key: string;
	/** label shown in tooltips and the palette */
	label: string;
	/** concrete shape selected by this key (shape tool only) */
	shape?: ShapeType;
}

/** Tool keys. The first entry of a tool is its primary UI hint. */
export const TOOL_SHORTCUTS: readonly ToolShortcut[] = [
	{ tool: 'select', key: 'v', label: 'V' },
	{ tool: 'pen', key: 'p', label: 'P' },
	{ tool: 'highlighter', key: 'h', label: 'H' },
	{ tool: 'eraser', key: 'e', label: 'E' },
	{ tool: 'text', key: 't', label: 'T' },
	{ tool: 'sticky', key: 's', label: 'S' },
	{ tool: 'sticky', key: 'n', label: 'N' },
	{ tool: 'shape', key: 'r', label: 'R', shape: 'rect' },
	{ tool: 'shape', key: 'o', label: 'O', shape: 'ellipse' },
	{ tool: 'shape', key: 'l', label: 'L', shape: 'line' },
	{ tool: 'shape', key: 'a', label: 'A', shape: 'arrow' },
	{ tool: 'connector', key: 'c', label: 'C' },
	{ tool: 'image', key: 'i', label: 'I' }
];

/** Ctrl/Cmd shortcut labels shown by the palette. */
export const COMMAND_SHORTCUTS: Readonly<Record<string, string>> = {
	undo: 'Ctrl+Z',
	redo: 'Ctrl+Shift+Z',
	'zoom-reset': 'Ctrl+0',
	'bring-forward': ']',
	'send-backward': '[',
	'bring-to-front': 'Ctrl+]',
	'send-to-back': 'Ctrl+['
};

export type ReorderMode = 'front' | 'back' | 'forward' | 'backward';

export interface ReorderShortcut {
	id: string;
	key: string;
	/** Ctrl/Cmd is required when true, forbidden when false */
	ctrl: boolean;
	mode: ReorderMode;
	label: string;
}

/** Z-order keys (§M0-08): `]`/`[` one step, Ctrl+`]`/`[` all the way. */
export const REORDER_SHORTCUTS: readonly ReorderShortcut[] = [
	{ id: 'bring-forward', key: ']', ctrl: false, mode: 'forward', label: ']' },
	{ id: 'send-backward', key: '[', ctrl: false, mode: 'backward', label: '[' },
	{ id: 'bring-to-front', key: ']', ctrl: true, mode: 'front', label: 'Ctrl+]' },
	{ id: 'send-to-back', key: '[', ctrl: true, mode: 'back', label: 'Ctrl+[' }
];

/** Look up a reorder binding for a pressed key + modifier state. */
export function reorderShortcutFor(key: string, mod: boolean): ReorderShortcut | undefined {
	return REORDER_SHORTCUTS.find((s) => s.key === key && s.ctrl === mod);
}

/** Look up the tool binding for a pressed key (case-insensitive). */
export function toolShortcutForKey(key: string): ToolShortcut | undefined {
	const k = key.toLowerCase();
	return TOOL_SHORTCUTS.find((s) => s.key === k);
}

/** Primary hint for a tool id or palette command id (undefined when unbound). */
export function shortcutLabelFor(id: string): string | undefined {
	const tool = TOOL_SHORTCUTS.find((s) => s.tool === id);
	if (tool) return tool.label;
	return COMMAND_SHORTCUTS[id];
}

/**
 * True when the key event must be left to the focused field (B04) or to an
 * open modal. Placeholders `input`, `textarea`, `contenteditable` and modal
 * shortcuts never reach the canvas.
 */
export function shouldIgnoreShortcut(
	e: { target: unknown },
	opts: { modalOpen?: boolean } = {}
): boolean {
	if (opts.modalOpen) return true;
	const target = e.target as { tagName?: unknown; isContentEditable?: unknown } | null;
	if (!target) return false;
	const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
	return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
}

// ── Keydown dispatcher (§M1-01) ──

/** Board actions the keydown dispatcher can trigger. */
export interface KeyboardContext {
	getEngine: () => CanvasEngine | null;
	isEditingText: () => boolean;
	isModalOpen: () => boolean;
	setSpaceDown: (down: boolean) => void;
	zoomIn: () => void;
	zoomOut: () => void;
	resetZoom: () => void;
	setTool: (tool: ToolId) => void;
	setShape: (shape: ShapeType) => void;
	openPalette: () => void;
	selectAll: () => void;
	clearSelection: () => void;
	deleteSelection: () => void;
	duplicateSelection: () => void;
	reorderSelection: (mode: ReorderMode) => void;
	copySelection: () => void;
	cutSelection: () => void;
	pasteClipboard: () => void;
	groupSelection: () => void;
	ungroupSelection: () => void;
	toggleLockSelection: () => void;
	nudgeSelection: (dx: number, dy: number) => void;
	undo: () => void;
	redo: () => void;
}

/** Arrow-key nudge directions (§M1-07): 1 px, ×10 with Shift. */
const NUDGE_DIRECTIONS: Readonly<Record<string, { x: number; y: number }>> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 }
};

/** Canvas keydown handler: editor guard, modal/input guard, tools and commands. */
export function handleCanvasKeyDown(e: KeyboardEvent, ctx: KeyboardContext): void {
	// while the in-canvas editor is open, keys belong to the textarea (B03)
	if (ctx.isEditingText()) return;
	// B04: never steal keys from inputs/contenteditable or while a modal is open
	if (shouldIgnoreShortcut(e, { modalOpen: ctx.isModalOpen() })) return;

	if (e.code === 'Space' && !e.repeat) ctx.setSpaceDown(true);
	if (e.key === '+' || e.key === '=') ctx.zoomIn();
	if (e.key === '-') ctx.zoomOut();
	if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
		e.preventDefault();
		ctx.resetZoom();
	}

	const sel = ctx.getEngine();
	if (!sel) return;
	const mod = e.ctrlKey || e.metaKey;

	// tool shortcuts from the shared table (B09): S/N → sticky, R/O/L/A → shape
	if (!mod) {
		const shortcut = toolShortcutForKey(e.key);
		if (shortcut) {
			if (shortcut.shape) ctx.setShape(shortcut.shape);
			ctx.setTool(shortcut.tool);
			return;
		}
	}

	if (mod && (e.key === 'k' || e.key === 'K')) {
		e.preventDefault();
		ctx.openPalette();
		return;
	}
	if (e.key === 'Delete' || e.key === 'Backspace') {
		if (sel.selectionManager.selected.length) {
			e.preventDefault();
			ctx.deleteSelection();
		}
	}
	if (mod && (e.key === 'd' || e.key === 'D')) {
		e.preventDefault();
		ctx.duplicateSelection();
	}
	if (mod && (e.key === 'a' || e.key === 'A')) {
		e.preventDefault();
		ctx.selectAll();
	}
	if (mod && (e.key === 'c' || e.key === 'C')) {
		e.preventDefault();
		ctx.copySelection();
	}
	if (mod && (e.key === 'x' || e.key === 'X')) {
		e.preventDefault();
		ctx.cutSelection();
	}
	if (mod && (e.key === 'v' || e.key === 'V')) {
		// handled here (and the native paste event suppressed) for deterministic behavior
		e.preventDefault();
		ctx.pasteClipboard();
	}
	// groups (§M1-05) and lock (§M1-06)
	if (mod && (e.key === 'g' || e.key === 'G')) {
		e.preventDefault();
		if (e.shiftKey) ctx.ungroupSelection();
		else ctx.groupSelection();
		return;
	}
	if (mod && e.shiftKey && (e.key === 'l' || e.key === 'L')) {
		e.preventDefault();
		ctx.toggleLockSelection();
	}
	// nudge with the arrow keys (§M1-07)
	const nudge = NUDGE_DIRECTIONS[e.key];
	if (nudge && !mod) {
		e.preventDefault();
		const step = e.shiftKey ? 10 : 1;
		ctx.nudgeSelection(nudge.x * step, nudge.y * step);
	}
	if (e.key === 'Escape') ctx.clearSelection();

	// z-order shortcuts from the shared table (M0-08): ]/[ one step, Ctrl+] /Ctrl+[ front/back
	const reorder = reorderShortcutFor(e.key, mod);
	if (reorder) {
		e.preventDefault();
		ctx.reorderSelection(reorder.mode);
		return;
	}

	// ── Fase 10: undo/redo shortcuts ──
	if (mod && (e.key === 'z' || e.key === 'Z')) {
		e.preventDefault();
		if (e.shiftKey) ctx.redo();
		else ctx.undo();
	}
	if (mod && (e.key === 'y' || e.key === 'Y')) {
		e.preventDefault();
		ctx.redo();
	}
}
