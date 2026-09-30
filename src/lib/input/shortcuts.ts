// Single source of truth for keyboard shortcuts (§M0-05, fixes B04/B09).
// Consumed by the BoardCanvas keydown, the ToolBar hints and the CommandPalette.
import type { ToolId } from '$lib/canvas/CanvasEngine';
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
