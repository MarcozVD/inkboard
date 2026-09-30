import { describe, expect, it } from 'vitest';
import {
	COMMAND_SHORTCUTS,
	TOOL_SHORTCUTS,
	shortcutLabelFor,
	shouldIgnoreShortcut,
	toolShortcutForKey
} from './shortcuts';

describe('shortcuts — tool bindings', () => {
	it('maps S and N to sticky', () => {
		expect(toolShortcutForKey('s')?.tool).toBe('sticky');
		expect(toolShortcutForKey('N')?.tool).toBe('sticky');
	});

	it('maps R/O/L/A to the concrete shape', () => {
		expect(toolShortcutForKey('r')).toMatchObject({ tool: 'shape', shape: 'rect' });
		expect(toolShortcutForKey('o')).toMatchObject({ tool: 'shape', shape: 'ellipse' });
		expect(toolShortcutForKey('l')).toMatchObject({ tool: 'shape', shape: 'line' });
		expect(toolShortcutForKey('a')).toMatchObject({ tool: 'shape', shape: 'arrow' });
	});

	it('returns undefined for unbound keys', () => {
		expect(toolShortcutForKey('z')).toBeUndefined();
		expect(toolShortcutForKey('1')).toBeUndefined();
	});

	it('has a unique key per binding and a primary label per tool', () => {
		const keys = TOOL_SHORTCUTS.map((s) => s.key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(shortcutLabelFor('select')).toBe('V');
		expect(shortcutLabelFor('sticky')).toBe('S');
		expect(shortcutLabelFor('shape')).toBe('R');
		expect(shortcutLabelFor('image')).toBe('I');
		expect(shortcutLabelFor('connector')).toBeUndefined();
	});

	it('exposes command labels for the palette', () => {
		expect(shortcutLabelFor('undo')).toBe(COMMAND_SHORTCUTS.undo);
		expect(shortcutLabelFor('redo')).toBe(COMMAND_SHORTCUTS.redo);
		expect(shortcutLabelFor('settings')).toBeUndefined();
	});
});

describe('shortcuts — shouldIgnoreShortcut', () => {
	it('ignores input, textarea and contenteditable targets', () => {
		expect(shouldIgnoreShortcut({ target: { tagName: 'INPUT' } })).toBe(true);
		expect(shouldIgnoreShortcut({ target: { tagName: 'TEXTAREA' } })).toBe(true);
		expect(shouldIgnoreShortcut({ target: { tagName: 'div', isContentEditable: true } })).toBe(true);
	});

	it('allows regular targets', () => {
		expect(shouldIgnoreShortcut({ target: { tagName: 'CANVAS' } })).toBe(false);
		expect(shouldIgnoreShortcut({ target: { tagName: 'DIV', isContentEditable: false } })).toBe(false);
		expect(shouldIgnoreShortcut({ target: null })).toBe(false);
	});

	it('ignores everything while a modal is open', () => {
		expect(shouldIgnoreShortcut({ target: { tagName: 'CANVAS' } }, { modalOpen: true })).toBe(true);
	});
});
