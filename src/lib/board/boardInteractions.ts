// boardInteractions — UI data builders for BoardCanvas (§M1-01).
// Keeps BoardCanvas as composition: palette, toolbar, context menu and fit logic.
import { worldToScreen } from '$lib/canvas/Camera';
import type { CameraState } from '$lib/canvas/Camera';
import type { CanvasEngine, ToolId } from '$lib/canvas/CanvasEngine';
import type { CanvasObject } from '$lib/objects/types';
import type { CtxAction } from '$lib/components/toolbar/ContextToolbar.svelte';
import type { MenuItem } from '$lib/components/menus/ContextMenu.svelte';
import type { PaletteCmd } from '$lib/components/menus/CommandPalette.svelte';
import type { ToolItem } from '$lib/components/toolbar/ToolBar.svelte';
import type { CreateItem } from '$lib/components/panels/CreatePanel.svelte';
import type { ExportFormat } from '$lib/io/transfer';
import type { ReorderMode } from '$lib/input/shortcuts';

export const TOOLBAR_TOOLS: ToolItem[] = [
	{ id: 'select', icon: 'select', label: 'Select' },
	{ id: 'pen', icon: 'pen', label: 'Pen' },
	{ id: 'highlighter', icon: 'highlighter', label: 'Highlighter' },
	{ id: 'eraser', icon: 'eraser', label: 'Eraser' },
	{ id: 'text', icon: 'text', label: 'Text' },
	{ id: 'sticky', icon: 'sticky', label: 'Sticky Note' },
	{ id: 'shape', icon: 'shapes', label: 'Shapes' },
	{ id: 'image', icon: 'image', label: 'Image' }
	// 'connector' stays hidden until M1-09 (B10)
];

export const CREATE_ITEMS: CreateItem[] = [
	{ id: 'sticky', icon: 'sticky', label: 'Sticky note' },
	{ id: 'text', icon: 'text', label: 'Text' },
	{ id: 'shape', icon: 'shapes', label: 'Shape' },
	{ id: 'image', icon: 'image', label: 'Image' }
];

export interface BoardActionDeps {
	duplicateSelection: () => void;
	reorderSelection: (mode: ReorderMode) => void;
	deleteSelection: () => void;
	copySelection: () => void;
	cutSelection: () => void;
	pasteClipboard: (at?: { x: number; y: number } | null) => void;
	setTool: (tool: ToolId) => void;
	zoomFit: () => void;
	resetZoom: () => void;
	onExport: (format: ExportFormat) => void;
	openSettings: () => void;
	undo: () => void;
	redo: () => void;
	onDirty: () => void;
}

/** Context-toolbar actions for the current selection (screen-anchored). */
export function buildSelectionToolbar(
	engine: CanvasEngine,
	camera: CameraState,
	deps: BoardActionDeps
): { x: number; y: number; actions: CtxAction[] } | null {
	const sel = engine.selectionManager;
	const bounds = sel.getSelectionBounds();
	if (!bounds || sel.selected.length === 0) return null;
	const [x, y] = worldToScreen(bounds.x + bounds.width / 2, bounds.y, camera);
	const actions: CtxAction[] = [
		{ id: 'duplicate', icon: 'duplicate', label: 'Duplicate', onClick: deps.duplicateSelection },
		{ id: 'front', icon: 'layer-front', label: 'Bring to front', onClick: () => deps.reorderSelection('front') },
		{ id: 'back', icon: 'layer-back', label: 'Send to back', onClick: () => deps.reorderSelection('back') },
		{ id: 'delete', icon: 'trash', label: 'Delete', onClick: deps.deleteSelection }
	];
	return { x, y, actions };
}

/** Right-click menu items for the object (or empty canvas) under a point. */
export function buildContextMenu(
	engine: CanvasEngine,
	world: { x: number; y: number },
	deps: BoardActionDeps
): MenuItem[] {
	const obj = engine.selectionManager.hitTest(world);
	if (!obj) {
		return [
			{ label: 'Paste', icon: 'import', action: () => deps.pasteClipboard(world) },
			{ separator: true },
			{ label: 'New sticky note', icon: 'sticky', action: () => deps.setTool('sticky') },
			{ label: 'New text', icon: 'text', action: () => deps.setTool('text') },
			{ separator: true },
			{ label: 'Select all', action: () => { engine.selectionManager.selectMany(engine.store.getAll().map((o) => o.id)); deps.onDirty(); } },
			{ label: 'Zoom to fit', icon: 'fit', action: deps.zoomFit }
		];
	}
	const objId = obj.id;
	const sel = engine.selectionManager;
	return [
		{ label: 'Copy', icon: 'copy', action: () => { sel.selectMany([objId]); deps.copySelection(); } },
		{ label: 'Cut', icon: 'cut', action: () => { sel.selectMany([objId]); deps.cutSelection(); } },
		{ label: 'Paste', icon: 'import', action: () => deps.pasteClipboard(world) },
		{ separator: true },
		{ label: 'Duplicate', icon: 'duplicate', action: () => { sel.selectMany([objId]); deps.duplicateSelection(); } },
		{ label: 'Delete', icon: 'trash', danger: true, action: () => { sel.selectMany([objId]); deps.deleteSelection(); } }
	];
}

/** Command palette entries; hints come from the shortcut table. */
export function buildPaletteCommands(deps: BoardActionDeps): PaletteCmd[] {
	return [
		{ id: 'select', label: 'Select tool', icon: 'select', action: () => deps.setTool('select'), group: 'Tools' },
		{ id: 'pen', label: 'Pen tool', icon: 'pen', action: () => deps.setTool('pen'), group: 'Tools' },
		{ id: 'highlighter', label: 'Highlighter', icon: 'highlighter', action: () => deps.setTool('highlighter'), group: 'Tools' },
		{ id: 'eraser', label: 'Eraser', icon: 'eraser', action: () => deps.setTool('eraser'), group: 'Tools' },
		{ id: 'text', label: 'Text tool', icon: 'text', action: () => deps.setTool('text'), group: 'Tools' },
		{ id: 'sticky', label: 'Sticky note', icon: 'sticky', action: () => deps.setTool('sticky'), group: 'Tools' },
		{ id: 'shape', label: 'Shapes', icon: 'shapes', action: () => deps.setTool('shape'), group: 'Tools' },
		{ id: 'image', label: 'Image', icon: 'image', action: () => deps.setTool('image'), group: 'Tools' },
		{ id: 'undo', label: 'Undo', icon: 'undo', action: deps.undo, group: 'Actions' },
		{ id: 'redo', label: 'Redo', icon: 'redo', action: deps.redo, group: 'Actions' },
		{ id: 'export-png', label: 'Export as PNG', icon: 'export', action: () => deps.onExport('png'), group: 'Export' },
		{ id: 'export-svg', label: 'Export as SVG', icon: 'export', action: () => deps.onExport('svg'), group: 'Export' },
		{ id: 'export-json', label: 'Export as JSON', icon: 'export', action: () => deps.onExport('json'), group: 'Export' },
		{ id: 'zoom-fit', label: 'Zoom to fit', icon: 'fit', action: deps.zoomFit, group: 'View' },
		{ id: 'zoom-reset', label: 'Reset zoom', action: deps.resetZoom, group: 'View' },
		{ id: 'settings', label: 'Settings', icon: 'settings', action: deps.openSettings, group: 'App' }
	];
}

/** Camera that fits all objects in the view, or null when there is nothing to fit. */
export function fitCameraToObjects(
	objects: CanvasObject[],
	view: { width: number; height: number }
): CameraState | null {
	if (objects.length === 0) return null;
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const o of objects) {
		const t = o.transform;
		minX = Math.min(minX, t.x, t.x + (t.width ?? 0));
		minY = Math.min(minY, t.y, t.y + (t.height ?? 0));
		maxX = Math.max(maxX, t.x, t.x + (t.width ?? 0));
		maxY = Math.max(maxY, t.y, t.y + (t.height ?? 0));
	}
	if (!isFinite(minX)) return null;
	const w = maxX - minX, h = maxY - minY;
	const zoom = Math.max(0.05, Math.min(view.width / (w + 80), view.height / (h + 80), 4));
	return {
		x: view.width / 2 - (minX + w / 2) * zoom,
		y: view.height / 2 - (minY + h / 2) * zoom,
		zoom,
		minZoom: 0.05,
		maxZoom: 32
	};
}
