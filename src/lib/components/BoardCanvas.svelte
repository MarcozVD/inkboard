<script lang="ts">
	import { onMount } from 'svelte';
	import { DEFAULT_CAMERA, resetZoom, zoomAt } from '$lib/canvas/Camera';
	import type { CameraState } from '$lib/canvas/Camera';
	import type { CanvasEngine, ToolId } from '$lib/canvas/CanvasEngine';
	import { handleCanvasKeyDown, type KeyboardContext, type ReorderMode } from '$lib/input/shortcuts';
	import { cancelTextContent, commitTextContent, deleteObjects, duplicateObjects, reorderObjects } from '$lib/canvas/commands';
	import { BoardRuntime } from '$lib/board/BoardRuntime';
	import {
		buildContextMenu,
		buildPaletteCommands,
		buildSelectionToolbar,
		fitCameraToObjects,
		type BoardActionDeps
	} from '$lib/board/boardInteractions';
	import { createTransferHandlers, dropImage, pasteImage, type ExportFormat } from '$lib/io/transfer';
	import type { EditableObj, GridConfig, ShapeType } from '$lib/objects/types';
	import { ui, uiActions } from '$lib/stores/ui.svelte';
	import { goto } from '$app/navigation';
	import TextEditor from '$lib/components/TextEditor.svelte';
	import CanvasHint from '$lib/components/board/CanvasHint.svelte';
	import BoardChrome from '$lib/components/board/BoardChrome.svelte';
	import ZoomControls from '$lib/components/board/ZoomControls.svelte';
	import ContextMenu, { type MenuItem } from '$lib/components/menus/ContextMenu.svelte';
	import CommandPalette from '$lib/components/menus/CommandPalette.svelte';
	import ContextToolbar, { type CtxAction } from '$lib/components/toolbar/ContextToolbar.svelte';

	let { boardId }: { boardId: string } = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let activeTool = $state<ToolId>('select');
	let currentShape = $state<ShapeType>('rect');
	let editingTextId = $state<string | null>(null);
	let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
	let boardName = $state('Untitled');
	let showExportMenu = $state(false);
	let showCreatePanel = $state(false);
	let ctxMenu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
	let showPalette = $state(false);
	let ctxBar = $state<{ x: number; y: number; actions: CtxAction[] } | null>(null);
	let showSettings = $state(false);
	let theme = $state<'dark' | 'light' | 'system'>('dark');
	let objectCount = $state(0);

	let camera: CameraState = $state({ ...DEFAULT_CAMERA });
	let grid: GridConfig = $state({ enabled: true, size: 32, color: '#2a2d34', opacity: 0.6 });
	let canvasRect = $state({ left: 0, top: 0, width: 0, height: 0 });

	let engine: CanvasEngine | null = $state(null);
	let runtime: BoardRuntime | null = null;
	let destroyed = false;
	let spaceDown = false;

	const editingObj = $derived.by(() => {
		const eng = engine;
		if (!eng || !editingTextId) return null;
		return (eng.store.get(editingTextId) as unknown as EditableObj) ?? null;
	});

	const transfer = createTransferHandlers({
		getBoardId: () => boardId,
		getEngine: () => engine,
		onDirty: () => markDirty(),
		getMeta: transferMeta
	});

	function markDirty() {
		runtime?.markDirty();
	}

	function syncShell() {
		if (destroyed) return; // B14: no writes to the ui store after unmount
		ui.boardName = boardName;
		ui.saveState = saveState;
		ui.canUndo = engine?.history.canUndo ?? false;
		ui.canRedo = engine?.history.canRedo ?? false;
	}

	function transferMeta() {
		return {
			name: boardName,
			camera,
			grid,
			createdAt: runtime?.session.boardCreatedAt ?? Date.now(),
			view: { width: canvasRect.width, height: canvasRect.height }
		};
	}

	function setTool(t: ToolId) {
		// B10: UI only follows when the engine actually accepted the tool
		const accepted = engine?.setTool(t) ?? false;
		if (!accepted) return;
		activeTool = t;
		if (t !== 'select') editingTextId = null;
		showCreatePanel = false;
	}

	function handleCreate(id: string) {
		showCreatePanel = false;
		if (id === 'sticky' || id === 'text' || id === 'shape' || id === 'image') setTool(id as ToolId);
	}

	function setShape(shape: ShapeType) {
		if (!engine) return;
		engine.shapeTool.config.shape = shape;
		currentShape = shape;
		setTool('shape');
	}

	function zoomIn() {
		camera = zoomAt(camera, canvasRect.width / 2, canvasRect.height / 2, 1.25);
		markDirty();
	}
	function zoomOut() {
		camera = zoomAt(camera, canvasRect.width / 2, canvasRect.height / 2, 0.8);
		markDirty();
	}
	function zoomReset() {
		camera = resetZoom(camera, canvasRect.width, canvasRect.height);
		markDirty();
	}
	function zoomFit() {
		const next = fitCameraToObjects(engine?.store.toJSON() ?? [], canvasRect);
		if (next) camera = next;
		else zoomReset();
		markDirty();
	}

	function deleteSelection() {
		if (!engine) return;
		deleteObjects(engine);
		ctxBar = null;
		syncShell();
		markDirty();
	}
	function duplicateSelection() {
		if (!engine) return;
		duplicateObjects(engine);
		updateCtxBar();
		syncShell();
		markDirty();
	}
	function reorderSelection(mode: ReorderMode) {
		if (!engine) return;
		reorderObjects(engine, mode);
		syncShell();
		markDirty();
	}
	function updateCtxBar() {
		ctxBar = engine ? buildSelectionToolbar(engine, camera, deps) : null;
	}

	function openTextEditor(obj: EditableObj) {
		editingTextId = obj.id;
	}
	function commitTextEdit(content: string) {
		const id = editingTextId;
		editingTextId = null;
		if (!engine || !id) return;
		commitTextContent(engine, id, content);
		syncShell();
		markDirty();
	}
	function cancelTextEdit() {
		const id = editingTextId;
		editingTextId = null;
		if (engine && id) cancelTextContent(engine, id);
		syncShell();
		markDirty();
	}

	function onDblClick(e: MouseEvent) {
		if (!engine || !runtime || activeTool !== 'select') return;
		const p = runtime.input.toCanvasPoint(e);
		const hit = engine.selectionManager.hitTest({ x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom });
		if (hit && (hit.type === 'text' || hit.type === 'sticky_note')) {
			openTextEditor(hit as unknown as EditableObj);
		}
	}

	function onPaste(e: ClipboardEvent) {
		if (engine) pasteImage({ engine, boardId, getMeta: transferMeta }, e);
	}
	function onDrop(e: DragEvent) {
		if (!engine || !runtime) return;
		e.preventDefault();
		const p = runtime.input.toCanvasPoint(e);
		dropImage({ engine, boardId, getMeta: transferMeta }, e, {
			x: (p.x - camera.x) / camera.zoom,
			y: (p.y - camera.y) / camera.zoom
		});
	}

	function onCanvasContextMenu(e: MouseEvent) {
		e.preventDefault();
		if (!engine || !runtime) return;
		const p = runtime.input.toCanvasPoint(e);
		ctxMenu = {
			x: e.clientX,
			y: e.clientY,
			items: buildContextMenu(engine, { x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom }, deps)
		};
	}

	function onKeyDown(e: KeyboardEvent) {
		handleCanvasKeyDown(e, deps);
	}
	function onKeyUp(e: KeyboardEvent) {
		if (e.code !== 'Space') return;
		spaceDown = false;
		if (canvasEl) canvasEl.style.cursor = 'default';
	}

	const deps = {
		getEngine: () => engine,
		isEditingText: () => editingTextId !== null,
		isModalOpen: () => showPalette || showSettings,
		setSpaceDown: (down: boolean) => {
			spaceDown = down;
			if (canvasEl) canvasEl.style.cursor = down ? 'grab' : 'default';
		},
		zoomIn,
		zoomOut,
		resetZoom: zoomReset,
		setTool,
		setShape,
		openPalette: () => { showPalette = true; },
		selectAll: () => {
			if (!engine) return;
			engine.selectionManager.selectMany(engine.store.getAll().map((o) => o.id));
			updateCtxBar();
			markDirty();
		},
		clearSelection: () => {
			engine?.selectionManager.clear();
			ctxBar = null;
			markDirty();
		},
		deleteSelection,
		duplicateSelection,
		reorderSelection,
		undo: () => { engine?.history.undo(); syncShell(); markDirty(); },
		redo: () => { engine?.history.redo(); syncShell(); markDirty(); },
		zoomFit,
		onExport: (format: ExportFormat) => { showExportMenu = false; transfer.export(format); },
		openSettings: () => { showSettings = true; },
		onDirty: markDirty
	} satisfies KeyboardContext & BoardActionDeps;

	const paletteCommands = buildPaletteCommands(deps);

	onMount(() => {
		runtime = new BoardRuntime({
			canvas: () => canvasEl,
			boardId,
			getCamera: () => camera,
			setCamera: (c) => (camera = c),
			getGrid: () => grid,
			getView: () => canvasRect,
			getBoardName: () => boardName,
			isSpaceDown: () => spaceDown,
			onEngine: (e) => (engine = e),
			onCanvasRect: (r) => (canvasRect = r),
			onObjectCount: (n) => (objectCount = n),
			onBoardLoaded: (board) => {
				boardName = board.name;
				camera = board.camera;
				grid = board.grid ?? grid;
			},
			onSaveState: (s) => {
				saveState = s;
				syncShell();
			},
			onDirty: markDirty,
			onGestureEnd: () => {
				markDirty();
				updateCtxBar();
				syncShell();
			},
			onPointerUp: updateCtxBar,
			onEditingRequest: openTextEditor,
			onShellChange: syncShell,
			onKeyDown,
			onKeyUp,
			onPaste
		});

		syncShell();
		uiActions.undo = deps.undo;
		uiActions.redo = deps.redo;
		uiActions.rename = (name: string) => {
			boardName = name || 'Untitled';
			runtime?.session.scheduleAutosave();
			syncShell();
		};
		uiActions.openSettings = deps.openSettings;
		uiActions.share = () => console.log('share (future)');
		uiActions.back = async () => {
			await runtime?.session.flushSave();
			goto('/');
		};

		const detach = runtime.attach();
		return () => {
			destroyed = true;
			detach();
			runtime?.dispose();
		};
	});
</script>

<div class="canvas-wrap">
	<canvas
		bind:this={canvasEl}
		class="board-canvas"
		ondblclick={onDblClick}
		ondragover={(e) => e.preventDefault()}
		ondrop={onDrop}
		oncontextmenu={onCanvasContextMenu}
	></canvas>

	<CanvasHint visible={objectCount === 0 && !editingObj} />

	<BoardChrome
		{activeTool}
		{currentShape}
		stickyColor={engine?.stickyTool.currentColor}
		{showCreatePanel}
		{showExportMenu}
		{showSettings}
		{grid}
		{theme}
		onSelectTool={(t) => setTool(t as ToolId)}
		onToggleCreate={() => (showCreatePanel = !showCreatePanel)}
		onToggleExport={() => (showExportMenu = !showExportMenu)}
		onShape={setShape}
		onStickyColor={(i) => engine?.stickyTool.setColor(i)}
		onCreate={handleCreate}
		onExport={deps.onExport}
		onImport={() => void transfer.import()}
		onCloseSettings={() => (showSettings = false)}
		onGridChange={(g) => {
			grid = g;
			markDirty();
		}}
		onThemeChange={(t) => {
			theme = t;
			document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
		}}
	/>

	<ZoomControls zoom={camera.zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={zoomReset} onFit={zoomFit} />

	{#if editingObj}
		<TextEditor
			obj={editingObj}
			camera={{ x: camera.x, y: camera.y, zoom: camera.zoom }}
			offset={{ x: canvasRect.left, y: canvasRect.top }}
			onCommit={commitTextEdit}
			onCancel={cancelTextEdit}
		/>
	{/if}

	{#if ctxBar}
		<ContextToolbar
			x={ctxBar.x}
			y={ctxBar.y}
			offsetX={canvasRect.left}
			offsetY={canvasRect.top}
			actions={ctxBar.actions}
		/>
	{/if}

	{#if ctxMenu}
		<ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => (ctxMenu = null)} />
	{/if}

	<CommandPalette open={showPalette} commands={paletteCommands} onClose={() => (showPalette = false)} />
</div>

<style>
	.canvas-wrap {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
	}

	.board-canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: default;
		touch-action: none;
	}
</style>
