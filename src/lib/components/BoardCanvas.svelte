<script lang="ts">
	import { onMount } from 'svelte';
	import { DEFAULT_CAMERA } from '$lib/canvas/Camera';
	import type { CameraState } from '$lib/canvas/Camera';
	import type { CanvasEngine, ToolId } from '$lib/canvas/CanvasEngine';
	import { handleCanvasKeyDown, type KeyboardContext, type ReorderMode } from '$lib/input/shortcuts';
	import { deleteObjects, duplicateObjects, reorderObjects } from '$lib/canvas/commands';
	import { createTextEditing } from '$lib/board/textEditing.svelte';
	import { themeController } from '$lib/board/theme.svelte';
	import { GRID } from '$lib/objects/colors';
	import { BoardRuntime } from '$lib/board/BoardRuntime';
	import { createStyleBridge } from '$lib/board/styleBridge.svelte';
	import { createClipboard } from '$lib/board/clipboard';
	import { createZoomActions } from '$lib/board/zoomActions';
	import { resolveDoubleClick, groupSelection, ungroupSelection } from '$lib/board/groups';
	import { toggleLockSelection } from '$lib/board/lock';
	import { nudgeSelection } from '$lib/board/nudge';
	import { buildContextMenu, buildPaletteCommands, buildSelectionToolbar, type BoardActionDeps } from '$lib/board/boardInteractions';
	import { createTransferHandlers, dropImage, exportSelectionPng, type ExportFormat } from '$lib/io/transfer';
	import type { EditableObj, GridConfig, ShapeType } from '$lib/objects/types';
	import { ui, uiActions } from '$lib/stores/ui.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import TextEditor from '$lib/components/TextEditor.svelte';
	import CanvasHint from '$lib/components/board/CanvasHint.svelte';
	import BoardChrome from '$lib/components/board/BoardChrome.svelte';
	import ZoomControls from '$lib/components/board/ZoomControls.svelte';
	import ContextMenu, { type MenuItem } from '$lib/components/menus/ContextMenu.svelte';
	import CommandPalette from '$lib/components/menus/CommandPalette.svelte';
	import ContextToolbar, { type CtxAction } from '$lib/components/toolbar/ContextToolbar.svelte';
	import ShortcutsOverlay from '$lib/components/menus/ShortcutsOverlay.svelte';
	let { boardId }: { boardId: string } = $props();
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let activeTool = $state<ToolId>('select');
	let currentShape = $state<ShapeType>('rect');
	let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
	let boardName = $state('Untitled');
	let showExportMenu = $state(false);
	let showCreatePanel = $state(false);
	let ctxMenu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
	let showPalette = $state(false);
	let ctxBar = $state<{ x: number; y: number; bottom: number; actions: CtxAction[] } | null>(null);
	let showSettings = $state(false);
	let showShortcuts = $state(false);
	let objectCount = $state(0);
	let camera: CameraState = $state({ ...DEFAULT_CAMERA });
	let grid: GridConfig = $state({ enabled: true, size: 32, color: GRID, opacity: 0.6 });
	let canvasRect = $state({ left: 0, top: 0, width: 0, height: 0 });
	let engine: CanvasEngine | null = $state(null);
	let runtime: BoardRuntime | null = null;
	let destroyed = false;
	let spaceDown = false;
	const transfer = createTransferHandlers({
		getBoardId: () => boardId,
		getEngine: () => engine,
		onDirty: () => markDirty(),
		getMeta: transferMeta
	});
	const styles = createStyleBridge({ getEngine: () => engine, onDirty: () => markDirty() });
	const clipboard = createClipboard({
		getEngine: () => engine,
		getCamera: () => camera,
		getView: () => canvasRect,
		getCursor: () => runtime?.input.lastPointer ?? null,
		onDirty: () => markDirty()
	});
	const zoom = createZoomActions({
		getEngine: () => engine,
		getCamera: () => camera,
		setCamera: (c) => (camera = c),
		getView: () => canvasRect,
		onDirty: () => markDirty()
	});
	const markDirty = () => runtime?.markDirty();
	$effect(() => {
		document.documentElement.dataset.theme = themeController.resolved;
		markDirty();
	});
	const textEdit = createTextEditing({ getEngine: () => engine, onShellChange: () => syncShell(), onDirty: () => markDirty() });
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
	const gridChanged = (g: GridConfig) => {
		grid = g;
		markDirty();
	};
	function setTool(t: ToolId) {
		const accepted = engine?.setTool(t) ?? false;
		if (!accepted) return;
		activeTool = t;
		if (t !== 'select') textEdit.close();
		showCreatePanel = false;
		styles.touch();
	}
	const handleCreate = (id: string) => {
		showCreatePanel = false;
		if (id === 'sticky' || id === 'text' || id === 'shape' || id === 'image') setTool(id as ToolId);
	};
	function setShape(shape: ShapeType) {
		if (!engine) return;
		engine.shapeTool.config.shape = shape;
		currentShape = shape;
		setTool('shape');
	}

	const deleteSelection = () => {
		if (!engine) return;
		deleteObjects(engine);
		ctxBar = null;
		syncShell();
		markDirty();
	};
	const duplicateSelection = () => {
		if (!engine) return;
		duplicateObjects(engine);
		updateCtxBar();
		syncShell();
		markDirty();
	};
	const reorderSelection = (mode: ReorderMode) => {
		if (!engine) return;
		reorderObjects(engine, mode);
		syncShell();
		markDirty();
	};
	function updateCtxBar() {
		ctxBar = engine ? buildSelectionToolbar(engine, camera, deps) : null;
		styles.touch();
	}
	function onDblClick(e: MouseEvent) {
		if (!engine || !runtime || activeTool !== 'select') return;
		const p = runtime.input.toCanvasPoint(e);
		const action = resolveDoubleClick(engine, { x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom });
		if (!action) return;
		if (action.kind === 'group') {
			engine.selectTool.enterGroup(action.objectId);
			updateCtxBar();
		} else {
			const obj = engine.store.get(action.objectId);
			if (obj) textEdit.open(obj as unknown as EditableObj);
		}
		markDirty();
	}
	function onPaste(e: ClipboardEvent) {
		clipboard.pasteFromEvent(e);
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
		isEditingText: () => textEdit.editingId !== null,
		isModalOpen: () => showPalette || showSettings || showShortcuts,
		setSpaceDown: (down: boolean) => {
			spaceDown = down;
			if (canvasEl) canvasEl.style.cursor = down ? 'grab' : 'default';
		},
		zoomIn: zoom.zoomIn,
		zoomOut: zoom.zoomOut,
		resetZoom: zoom.zoomReset,
		setTool,
		setShape,
		openPalette: () => {
			showPalette = true;
		},
		selectAll: () => {
			if (!engine) return;
			engine.selectionManager.selectMany(
				engine.store
					.getAll()
					.filter((o) => o.type !== 'group')
					.map((o) => o.id)
			);
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
		copySelection: () => void clipboard.copySelection(),
		cutSelection: () => clipboard.cutSelection(),
		pasteClipboard: (at?: { x: number; y: number } | null) => {
			void clipboard.paste(at);
		},
		groupSelection: () => {
			if (engine) {
				groupSelection(engine);
				syncShell();
				markDirty();
			}
		},
		ungroupSelection: () => {
			if (engine) {
				ungroupSelection(engine);
				syncShell();
				markDirty();
			}
		},
		toggleLockSelection: () => {
			if (engine) {
				toggleLockSelection(engine);
				syncShell();
				markDirty();
			}
		},
		nudgeSelection: (dx: number, dy: number) => {
			if (engine) {
				nudgeSelection(engine, dx, dy);
				syncShell();
				markDirty();
			}
		},
		toggleShortcutsOverlay: () => {
			showShortcuts = !showShortcuts;
		},
		exportSelection: () => {
			if (engine) void exportSelectionPng(engine);
		},
		undo: () => {
			engine?.history.undo();
			syncShell();
			markDirty();
		},
		redo: () => {
			engine?.history.redo();
			syncShell();
			markDirty();
		},
		zoomFit: zoom.zoomFit,
		onExport: (format: ExportFormat) => {
			showExportMenu = false;
			transfer.export(format);
		},
		openSettings: () => {
			showSettings = true;
		},
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
			getTheme: () => themeController.resolved,
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
			onEditingRequest: textEdit.open,
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
			goto(resolve('/'));
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
	<canvas bind:this={canvasEl} class="board-canvas" ondblclick={onDblClick} ondragover={(e) => e.preventDefault()} ondrop={onDrop} oncontextmenu={onCanvasContextMenu}></canvas>

	<CanvasHint visible={objectCount === 0 && !textEdit.editingObj} />

	<BoardChrome
		state={{ activeTool, currentShape, stickyColor: engine?.stickyTool.currentColor, styleControls: styles.toolControls, showCreatePanel, showExportMenu, showSettings, grid, theme: themeController.choice }}
		actions={{
			onSelectTool: (t) => setTool(t as ToolId),
			onToggleCreate: () => (showCreatePanel = !showCreatePanel),
			onToggleExport: () => (showExportMenu = !showExportMenu),
			onShape: setShape,
			onStickyColor: (i) => engine?.stickyTool.setColor(i),
			onCreate: handleCreate,
			onExport: deps.onExport,
			onImport: () => void transfer.import(),
			onCloseSettings: () => (showSettings = false),
			onGridChange: gridChanged,
			onThemeChange: (t) => themeController.set(t)
		}}
	/>

	<ZoomControls zoom={camera.zoom} onZoomIn={zoom.zoomIn} onZoomOut={zoom.zoomOut} onReset={zoom.zoomReset} onFit={zoom.zoomFit} />

	{#if textEdit.editingObj}
		<TextEditor obj={textEdit.editingObj} camera={{ x: camera.x, y: camera.y, zoom: camera.zoom }} offset={{ x: canvasRect.left, y: canvasRect.top }} onCommit={textEdit.commit} onCancel={textEdit.cancel} />
	{/if}

	{#if ctxBar}
		<ContextToolbar x={ctxBar.x} y={ctxBar.y} bottom={ctxBar.bottom} offsetX={canvasRect.left} offsetY={canvasRect.top} actions={ctxBar.actions} style={styles.selectionControls} />
	{/if}

	{#if ctxMenu}
		<ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => (ctxMenu = null)} />
	{/if}

	<CommandPalette open={showPalette} commands={paletteCommands} onClose={() => (showPalette = false)} />

	{#if showShortcuts}
		<ShortcutsOverlay onClose={() => (showShortcuts = false)} />
	{/if}
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
