<script lang="ts">
	import { onMount } from 'svelte';
	import { DEFAULT_CAMERA, pan, resetZoom, screenToWorld, worldToScreen, zoomAt } from '$lib/canvas/Camera';
	import type { CameraState } from '$lib/canvas/Camera';
	import { RenderLoop } from '$lib/canvas/RenderLoop';
	import { CanvasEngine, type ToolId } from '$lib/canvas/CanvasEngine';
	import { renderObject } from '$lib/objects/renderers';
	import type { GridConfig, CanvasObject } from '$lib/objects/types';
	import { createShape } from '$lib/objects/factory';
	import { v4 as uuidv4 } from 'uuid';
	import TextEditor from '$lib/components/TextEditor.svelte';
	import type { EditableObj, TextObject } from '$lib/objects/types';
	import { SHAPE_TYPES } from '$lib/tools/ShapeTool';
	import type { ShapeType } from '$lib/objects/types';
	import { stickyNoteColors } from '$lib/objects/renderers';
	import { loadBoard, saveBoard } from '$lib/io/persistence';
	import { boardToSvg } from '$lib/io/SvgExporter';
	import { boardToPngDataUrl } from '$lib/io/PngExporter';
	import { serializeBoard } from '$lib/io/InternalFormat';
	import { invoke } from '@tauri-apps/api/core';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';
	import { createText } from '$lib/objects/factory';
	import type { Board } from '$lib/objects/types';
	import { ui, uiActions } from '$lib/stores/ui.svelte';
	import ToolBar, { type ToolItem } from '$lib/components/toolbar/ToolBar.svelte';
	import ZoomControls from '$lib/components/board/ZoomControls.svelte';
	import CreatePanel, { type CreateItem } from '$lib/components/panels/CreatePanel.svelte';
	import { goto } from '$app/navigation';
	import ContextMenu, { type MenuItem } from '$lib/components/menus/ContextMenu.svelte';
	import CommandPalette, { type PaletteCmd } from '$lib/components/menus/CommandPalette.svelte';
	import ContextToolbar, { type CtxAction } from '$lib/components/toolbar/ContextToolbar.svelte';
	import SettingsPanel from '$lib/components/panels/SettingsPanel.svelte';

	let { boardId }: { boardId: string } = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let activeTool = $state<ToolId>('select');
	let editingText = $state<EditableObj | null>(null);
	let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
	let boardName = $state('Untitled');
	let showExportMenu = $state(false);
	let showCreatePanel = $state(false);
	let ctxMenu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
	let showPalette = $state(false);
	let ctxBar = $state<{ x: number; y: number; actions: CtxAction[] } | null>(null);
	let showSettings = $state(false);
	let theme = $state<'dark' | 'light' | 'system'>('dark');

	// ── Engine state (lives outside Svelte reactivity — §6) ──
	let camera: CameraState = $state({ ...DEFAULT_CAMERA });
	let grid: GridConfig = $state({ enabled: true, size: 32, color: '#2a2d34', opacity: 0.6 });

	let renderLoop: RenderLoop | null = null;
	let engine: CanvasEngine | null = $state(null);
	let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

	function markDirty() {
		renderLoop?.markDirty();
	}

	// Shell state sync — TopBar reads ui.*; refresh on every history-affecting change
	function syncShell() {
		ui.boardName = boardName;
		ui.saveState = saveState;
		ui.canUndo = engine?.history.canUndo ?? false;
		ui.canRedo = engine?.history.canRedo ?? false;
	}

	// ── Fase 11: autosave with debounce (§16) ──
	function scheduleAutosave() {
		if (autosaveTimer) clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(async () => {
			autosaveTimer = null;
			if (!engine) return;
			saveState = 'saving';
			syncShell();
			const board: Board = {
				id: boardId,
				workspaceId: 'default',
				name: boardName,
				version: 1,
				schemaVersion: '1.0.0',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				camera,
				objects: engine.store.toJSON(),
				background: { type: 'solid', color: '#0f1013' },
				grid,
				metadata: {}
			};
			try {
				await saveBoard(board);
				saveState = 'saved';
			} catch (err) {
				console.error('autosave failed', err);
				saveState = 'idle';
			}
			syncShell();
		}, 2000);
	}

	// image cache for data URLs (avoids re-decoding per frame)
	const imageCache = new Map<string, HTMLImageElement>();
	function getImage(src: string): HTMLImageElement | undefined {
		let img = imageCache.get(src);
		if (!img) {
			img = new Image();
			img.src = src;
			imageCache.set(src, img);
		}
		return img;
	}

	// ── Pointer state ──
	let isPanning = false;
	let panStart = { x: 0, y: 0 };
	let spaceDown = false;
	let pinchDist = 0;

	function getCtx(): CanvasRenderingContext2D | null {
		return canvasEl?.getContext('2d') ?? null;
	}

	// ── Grid rendering ──
	function drawGrid(ctx: CanvasRenderingContext2D) {
		if (!grid.enabled) return;
		const { size, color, opacity } = grid;
		if (size * camera.zoom < 8) return;

		const w = canvasEl!.width;
		const h = canvasEl!.height;
		const [wx0, wy0] = screenToWorld(0, 0, camera);
		const [wx1, wy1] = screenToWorld(w, h, camera);
		const startX = Math.floor(wx0 / size) * size;
		const startY = Math.floor(wy0 / size) * size;

		ctx.save();
		ctx.strokeStyle = color;
		ctx.globalAlpha = opacity;
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let x = startX; x <= wx1; x += size) {
			const [sx] = worldToScreenHelper(x, 0);
			ctx.moveTo(sx, 0);
			ctx.lineTo(sx, h);
		}
		for (let y = startY; y <= wy1; y += size) {
			const [, sy] = worldToScreenHelper(0, y);
			ctx.moveTo(0, sy);
			ctx.lineTo(w, sy);
		}
		ctx.stroke();
		ctx.restore();
	}

	function worldToScreenHelper(wx: number, wy: number): [number, number] {
		return [wx * camera.zoom + camera.x, wy * camera.zoom + camera.y];
	}

	// ── Render ──
	function render() {
		const ctx = getCtx();
		if (!ctx || !canvasEl || !engine) return;
		const w = canvasEl.width;
		const h = canvasEl.height;

		ctx.fillStyle = '#0f1013';
		ctx.fillRect(0, 0, w, h);

		drawGrid(ctx);

		// viewport culling (§19)
		const [wx0, wy0] = screenToWorld(0, 0, camera);
		const [wx1, wy1] = screenToWorld(w, h, camera);
		const viewport = { x: wx0, y: wy0, width: wx1 - wx0, height: wy1 - wy0 };
		const visible = engine.store.queryViewport(viewport);

		ctx.save();
		ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);
		for (const obj of visible) {
			renderObject(ctx, obj, { getImage });
		}
		ctx.restore();

		renderSelectionOverlay(ctx);
	}

	function renderSelectionOverlay(ctx: CanvasRenderingContext2D) {
		if (!engine) return;
		const sel = engine.selectionManager;
		if (sel.selected.length === 0) return;

		const bounds = sel.getSelectionBounds();
		if (!bounds) return;

		const [x0, y0] = worldToScreenHelper(bounds.x, bounds.y);
		const [x1, y1] = worldToScreenHelper(bounds.x + bounds.width, bounds.y + bounds.height);
		const sx = Math.min(x0, x1);
		const sy = Math.min(y0, y1);
		const sw = Math.abs(x1 - x0);
		const sh = Math.abs(y1 - y0);

		ctx.save();
		ctx.strokeStyle = 'rgba(255,255,255,0.9)';
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 3]);
		ctx.strokeRect(sx, sy, sw, sh);
		ctx.setLineDash([]);

		const handles = sel.getHandles(worldToScreenHelper);
		for (const h of handles) {
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = 'rgba(255,255,255,0.6)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			if (h.id === 'rotate') {
				ctx.arc(h.position.x, h.position.y, 5, 0, Math.PI * 2);
				ctx.moveTo(sx + sw / 2, sy);
				ctx.lineTo(h.position.x, h.position.y + 5);
			} else {
				ctx.rect(h.position.x - 4, h.position.y - 4, 8, 8);
			}
			ctx.fill();
			ctx.stroke();
		}
		ctx.restore();

		// rect-select marquee (via selectTool)
		const marquee = (engine.selectTool as unknown as { getActiveRectSelect?: () => { x: number; y: number; width: number; height: number } | null }).getActiveRectSelect?.();
		if (marquee) {
			const [mx0, my0] = worldToScreenHelper(marquee.x, marquee.y);
			const [mx1, my1] = worldToScreenHelper(marquee.x + marquee.width, marquee.y + marquee.height);
			ctx.save();
			ctx.fillStyle = 'rgba(255,255,255,0.12)';
			ctx.strokeStyle = 'rgba(255,255,255,0.7)';
			ctx.lineWidth = 1;
			ctx.fillRect(mx0, my0, mx1 - mx0, my1 - my0);
			ctx.strokeRect(mx0, my0, mx1 - mx0, my1 - my0);
			ctx.restore();
		}
	}

	// ── Input handling ──
	function onPointerDown(e: PointerEvent) {
		if (!engine) return;
		const panMode = spaceDown || e.button === 1 || e.button === 2;
		if (panMode) {
			isPanning = true;
			panStart = { x: e.clientX, y: e.clientY };
			if (canvasEl) canvasEl.setPointerCapture(e.pointerId);
		} else {
			engine.pointerDown(e.clientX, e.clientY, { shift: e.shiftKey, button: e.button, pressure: e.pressure });
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!engine) return;
		if (isPanning) {
			camera = pan(camera, e.clientX - panStart.x, e.clientY - panStart.y);
			panStart = { x: e.clientX, y: e.clientY };
			markDirty();
		} else {
			engine.pointerMove(e.clientX, e.clientY, { shift: e.shiftKey, pressure: e.pressure });
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!engine) return;
		if (isPanning) {
			isPanning = false;
			if (canvasEl) canvasEl.releasePointerCapture(e.pointerId);
		} else {
			engine.pointerUp({ button: e.button, pressure: e.pressure });
			updateCtxBar();
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		if (e.ctrlKey) {
			const factor = Math.exp(-e.deltaY * 0.002);
			camera = zoomAt(camera, e.clientX, e.clientY, factor);
			markDirty();
			return;
		}
		camera = pan(camera, -e.deltaX, -e.deltaY);
		markDirty();
	}

	function setTool(t: ToolId) {
		engine?.setTool(t);
		activeTool = t;
		if (t !== 'select') editingText = null;
		showCreatePanel = false;
	}

	function handleCreate(id: string) {
		showCreatePanel = false;
		if (id === 'sticky') setTool('sticky');
		else if (id === 'text') setTool('text');
		else if (id === 'shape') setTool('shape');
		else if (id === 'image') setTool('image');
	}

	// ── Zoom handlers (FASE 2 — DESIGN.md zoom controls) ──
	function zoomIn() {
		if (canvasEl) camera = zoomAt(camera, canvasEl.width / 2, canvasEl.height / 2, 1.25);
		markDirty();
	}
	function zoomOut() {
		if (canvasEl) camera = zoomAt(camera, canvasEl.width / 2, canvasEl.height / 2, 0.8);
		markDirty();
	}
	function zoomReset() {
		if (canvasEl) camera = resetZoom(camera, canvasEl.width, canvasEl.height);
		markDirty();
	}
	function zoomFit() {
		// fit all objects (or reset if none)
		const objs = engine?.store.toJSON() ?? [];
		if (objs.length === 0 || !canvasEl) {
			zoomReset();
			return;
		}
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const o of objs) {
			const t = o.transform;
			minX = Math.min(minX, t.x, t.x + (t.width ?? 0));
			minY = Math.min(minY, t.y, t.y + (t.height ?? 0));
			maxX = Math.max(maxX, t.x, t.x + (t.width ?? 0));
			maxY = Math.max(maxY, t.y, t.y + (t.height ?? 0));
		}
		if (!isFinite(minX)) { zoomReset(); return; }
		const w = maxX - minX, h = maxY - minY;
		const cw = canvasEl.width, ch = canvasEl.height;
		const zoom = Math.min(cw / (w + 80), ch / (h + 80), 4);
		camera = {
			...camera,
			zoom: Math.max(0.05, zoom),
			x: cw / 2 - (minX + w / 2) * Math.max(0.05, zoom),
			y: ch / 2 - (minY + h / 2) * Math.max(0.05, zoom)
		};
		markDirty();
	}

	// ── Context toolbar (FASE 3 — DESIGN.md § Context Toolbar) ──
	function updateCtxBar() {
		if (!engine || !canvasEl) { ctxBar = null; return; }
		const eng = engine;
		const sel = eng.selectionManager;
		const bounds = sel.getSelectionBounds();
		if (!bounds || sel.selected.length === 0) { ctxBar = null; return; }
		// position above the selection, in screen space
		const [sx, sy] = worldToScreen(bounds.x + bounds.width / 2, bounds.y, camera);
		const actions: CtxAction[] = [
			{ id: 'duplicate', icon: 'duplicate', label: 'Duplicate', onClick: () => duplicateSelection() },
			{ id: 'front', icon: 'layer-front', label: 'Bring to front', onClick: () => { eng.store.bringToFront(sel.selected); syncShell(); markDirty(); } },
			{ id: 'back', icon: 'layer-back', label: 'Send to back', onClick: () => { eng.store.sendToBack(sel.selected); syncShell(); markDirty(); } },
			{ id: 'delete', icon: 'trash', label: 'Delete', onClick: () => {
				const ids = sel.selected;
				const store = eng.store;
				const objs = ids.map((id) => store.get(id)).filter(Boolean) as CanvasObject[];
				store.removeMany(ids);
				eng.history.push({
					description: 'Delete',
					undo: () => store.addMany(objs.map((o) => structuredClone(o))),
					redo: () => store.removeMany(ids)
				});
				sel.clear();
				ctxBar = null;
				syncShell(); markDirty();
			}}
		];
		ctxBar = { x: sx, y: sy, actions };
	}

	function setShape(shape: ShapeType) {
		if (engine) {
			engine.shapeTool.config.shape = shape;
			setTool('shape');
		}
	}

	function shapeIcon(shape: ShapeType): string {
		const icons: Record<ShapeType, string> = {
			rect: '▭',
			ellipse: '⬭',
			line: '╱',
			arrow: '➡',
			triangle: '△',
			diamond: '◇',
			star: '★',
			polygon: '⬡'
		};
		return icons[shape];
	}

	function openTextEditor(obj: EditableObj) {
		editingText = obj;
	}

	function onDblClick(e: MouseEvent) {
		if (!engine || activeTool !== 'select') return;
		const c = camera;
		const wx = (e.clientX - c.x) / c.zoom;
		const wy = (e.clientY - c.y) / c.zoom;
		const hit = engine.selectionManager.hitTest({ x: wx, y: wy });
		if (hit && (hit.type === 'text' || hit.type === 'sticky_note')) {
			openTextEditor(hit as unknown as EditableObj);
		}
	}

	// ── Fase 8: clipboard paste + drag & drop images ──
	function onPaste(e: ClipboardEvent) {
		if (!engine) return;
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const item of items) {
			if (item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (!file) continue;
				e.preventDefault();
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = reader.result as string;
					// center at current viewport
					const w = canvasEl!.width;
					const h = canvasEl!.height;
					const c = camera;
					const wx = (w / 2 - c.x) / c.zoom;
					const wy = (h / 2 - c.y) / c.zoom;
					engine!.imageTool.insertImage(dataUrl, file.name, wx, wy);
				};
				reader.readAsDataURL(file);
			}
		}
	}

	function onDrop(e: DragEvent) {
		if (!engine) return;
		e.preventDefault();
		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;
		const file = files[0];
		if (!file.type.startsWith('image/')) return;
		const c = camera;
		const wx = (e.clientX - c.x) / c.zoom;
		const wy = (e.clientY - c.y) / c.zoom;
		const reader = new FileReader();
		reader.onload = () => {
			engine!.imageTool.insertImage(reader.result as string, file.name, wx, wy);
		};
		reader.readAsDataURL(file);
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.code === 'Space' && !e.repeat) {
			spaceDown = true;
			if (canvasEl) canvasEl.style.cursor = 'grab';
		}
		if (e.key === '+' || e.key === '=') {
			camera = zoomAt(camera, canvasEl!.width / 2, canvasEl!.height / 2, 1.25);
			markDirty();
		}
		if (e.key === '-') {
			camera = zoomAt(camera, canvasEl!.width / 2, canvasEl!.height / 2, 0.8);
			markDirty();
		}
		if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			camera = resetZoom(camera, canvasEl!.width, canvasEl!.height);
			markDirty();
		}

		if (!engine) return;
		const sel = engine.selectionManager;
		const mod = e.ctrlKey || e.metaKey;

		// tool shortcuts (V/P/H/E, T/N/R/O/L/A/I)
		if (!mod) {
			const toolKey: Record<string, ToolId> = {
				v: 'select',
				p: 'pen',
				h: 'highlighter',
				e: 'eraser',
				t: 'text',
				n: 'sticky',
				r: 'shape',
				o: 'shape',
				l: 'shape',
				a: 'shape',
				i: 'image'
			};
			const t = toolKey[e.key.toLowerCase()];
			if (t) {
				setTool(t);
				return;
			}
		}

		if (mod && (e.key === 'k' || e.key === 'K')) {
			e.preventDefault();
			showPalette = true;
			return;
		}
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (sel.selected.length) {
				e.preventDefault();
				const store = engine.store;
				const objs = sel.selected.map((id) => store.get(id)).filter(Boolean) as CanvasObject[];
				if (objs.length) {
					const ids = objs.map((o) => o.id);
					store.removeMany(ids);
					engine.history.push({
						description: 'Delete',
						undo: () => store.addMany(objs.map((o) => structuredClone(o))),
						redo: () => store.removeMany(ids)
					});
				}
				sel.clear();
				syncShell();
				markDirty();
			}
		}
		if (mod && (e.key === 'd' || e.key === 'D')) {
			e.preventDefault();
			duplicateSelection();
		}
		if (mod && (e.key === 'a' || e.key === 'A')) {
			e.preventDefault();
			sel.selectMany(engine.store.getAll().map((o) => o.id));
			updateCtxBar();
			markDirty();
		}
		if (e.key === 'Escape') {
			sel.clear();
			ctxBar = null;
			markDirty();
		}
		if (e.key === ']') {
			e.preventDefault();
			engine.store.bringToFront(sel.selected);
			syncShell();
			markDirty();
		}
		if (e.key === '[') {
			e.preventDefault();
			engine.store.sendToBack(sel.selected);
			syncShell();
			markDirty();
		}

		// ── Fase 10: undo/redo shortcuts ──
		if (mod && (e.key === 'z' || e.key === 'Z')) {
			e.preventDefault();
			if (e.shiftKey) engine.history.redo();
			else engine.history.undo();
			syncShell();
			markDirty();
		}
		if (mod && (e.key === 'y' || e.key === 'Y')) {
			e.preventDefault();
			engine.history.redo();
			syncShell();
			markDirty();
		}
	}

	function duplicateSelection() {
		if (!engine) return;
		const sel = engine.selectionManager;
		if (sel.selected.length === 0) return;
		const clones: CanvasObject[] = [];
		for (const id of sel.selected) {
			const obj = engine.store.get(id);
			if (!obj) continue;
			const clone = structuredClone(obj);
			clone.id = uuidv4();
			clone.transform.x += 20;
			clone.transform.y += 20;
			clone.createdAt = Date.now();
			clone.updatedAt = Date.now();
			clones.push(clone);
		}
		engine.store.addMany(clones);
		sel.selectMany(clones.map((c) => c.id));
		// undoable duplicate
		const store = engine.store;
		const ids = clones.map((c) => c.id);
		engine.history.push({
			description: 'Duplicate',
			undo: () => store.removeMany(ids),
			redo: () => store.addMany(clones.map((c) => structuredClone(c)))
		});
		syncShell();
		markDirty();
	}

	// ── Fase 3: right-click context menu ──
	function onCanvasContextMenu(e: MouseEvent) {
		e.preventDefault();
		if (!engine) return;
		const wx = (e.clientX - camera.x) / camera.zoom;
		const wy = (e.clientY - camera.y) / camera.zoom;
		const obj = engine.selectionManager.hitTest({ x: wx, y: wy });
		if (obj) {
			const sel = engine.selectionManager;
			const objId = obj.id;
			ctxMenu = {
				x: e.clientX, y: e.clientY,
				items: [
					{ label: 'Copy', icon: 'copy', action: () => { /* clipboard */ } },
					{ label: 'Duplicate', icon: 'duplicate', action: () => { sel.selectMany([objId]); duplicateSelection(); } },
					{ label: 'Delete', icon: 'trash', danger: true, action: () => {
						sel.selectMany([objId]);
						const store = engine!.store;
						store.remove(objId);
						engine!.history.push({ description: 'Delete', undo: () => store.add(structuredClone(obj)), redo: () => store.remove(objId) });
						syncShell(); markDirty();
					}}
				]
			};
		} else {
			ctxMenu = {
				x: e.clientX, y: e.clientY,
				items: [
					{ label: 'New sticky note', icon: 'sticky', action: () => setTool('sticky') },
					{ label: 'New text', icon: 'text', action: () => setTool('text') },
					{ separator: true },
					{ label: 'Select all', action: () => { engine!.selectionManager.selectMany(engine!.store.getAll().map((o) => o.id)); markDirty(); } },
					{ label: 'Zoom to fit', icon: 'fit', action: () => zoomFit() }
				]
			};
		}
	}

	// ── Fase 3: command palette (Ctrl+K) ──
	const paletteCommands: PaletteCmd[] = [
		{ id: 'select', label: 'Select tool', hint: 'V', icon: 'select', action: () => setTool('select'), group: 'Tools' },
		{ id: 'pen', label: 'Pen tool', hint: 'P', icon: 'pen', action: () => setTool('pen'), group: 'Tools' },
		{ id: 'highlighter', label: 'Highlighter', hint: 'H', icon: 'highlighter', action: () => setTool('highlighter'), group: 'Tools' },
		{ id: 'eraser', label: 'Eraser', hint: 'E', icon: 'eraser', action: () => setTool('eraser'), group: 'Tools' },
		{ id: 'text', label: 'Text tool', hint: 'T', icon: 'text', action: () => setTool('text'), group: 'Tools' },
		{ id: 'sticky', label: 'Sticky note', hint: 'S', icon: 'sticky', action: () => setTool('sticky'), group: 'Tools' },
		{ id: 'shape', label: 'Shapes', hint: 'R', icon: 'shapes', action: () => setTool('shape'), group: 'Tools' },
		{ id: 'image', label: 'Image', icon: 'image', action: () => setTool('image'), group: 'Tools' },
		{ id: 'undo', label: 'Undo', hint: 'Ctrl+Z', icon: 'undo', action: () => { uiActions.undo?.(); }, group: 'Actions' },
		{ id: 'redo', label: 'Redo', hint: 'Ctrl+Shift+Z', icon: 'redo', action: () => { uiActions.redo?.(); }, group: 'Actions' },
		{ id: 'export-png', label: 'Export as PNG', icon: 'export', action: () => exportBoard('png'), group: 'Export' },
		{ id: 'export-svg', label: 'Export as SVG', icon: 'export', action: () => exportBoard('svg'), group: 'Export' },
		{ id: 'export-json', label: 'Export as JSON', icon: 'export', action: () => exportBoard('json'), group: 'Export' },
		{ id: 'zoom-fit', label: 'Zoom to fit', icon: 'fit', action: () => zoomFit(), group: 'View' },
		{ id: 'zoom-reset', label: 'Reset zoom', hint: 'Ctrl+0', action: () => zoomReset(), group: 'View' },
		{ id: 'settings', label: 'Settings', icon: 'settings', action: () => uiActions.openSettings?.(), group: 'App' },
	];

	// ── Fase 14: export (browser download — works in Tauri webview too) ──
	function downloadFile(filename: string, content: string, mime: string) {
		const blob = new Blob([content], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	async function exportBoard(format: 'svg' | 'png' | 'json') {
		if (!engine) return;
		showExportMenu = false;
		const objects = engine.store.toJSON();
		const base = `inkboard-${boardId.slice(0, 8)}`;
		try {
			if (format === 'svg') {
				const svg = boardToSvg(objects);
				downloadFile(`${base}.svg`, svg, 'image/svg+xml');
			} else if (format === 'png') {
				const dataUrl = await boardToPngDataUrl(objects, { scale: 2 });
				// data URL → blob
				const res = await fetch(dataUrl);
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${base}.png`;
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(url);
			} else {
				const board: Board = {
					id: boardId,
					workspaceId: 'default',
					name: boardName,
					version: 1,
					schemaVersion: '1.0.0',
					createdAt: Date.now(),
					updatedAt: Date.now(),
					camera,
					objects,
					background: { type: 'solid', color: '#0f1013' },
					grid,
					metadata: {}
				};
				downloadFile(`${base}.json`, serializeBoard(board), 'application/json');
			}
		} catch (err) {
			console.error('export failed', err);
		}
	}

	async function importFile() {
		if (!engine) return;
		showExportMenu = false;

		// pick a file — Tauri dialog if available, else hidden input
		let path: string | null = null;
		let file: File | null = null;
		if (typeof openDialog === 'function') {
			try {
				path = (await openDialog({ multiple: false })) as string | null;
			} catch {
				path = null;
			}
		}
		if (!path) {
			// browser fallback
			file = await pickFileFallback();
			if (!file) return;
		}

		const world = { x: 0, y: 0 };

		if (path) {
			// Tauri path: ask Rust to detect + inspect
			try {
				const info = await invoke<{
					format: string;
					title?: string | null;
					texts?: string[];
					name?: string;
				}>('inspect_import', { path });
				if (info.format === 'image' && file === null) {
					// image via Tauri path — read as data URL
					const bytes = await invoke<number[]>('read_file_bytes', { path });
					const dataUrl = bytesToDataUrl(bytes, info.name ?? 'image');
					engine.imageTool.insertImage(dataUrl, info.name ?? 'image', world.x, world.y);
				} else if (info.format === 'ms_whiteboard_zip') {
					insertMsWhiteboardTexts(info.title, info.texts ?? []);
				} else if (info.format === 'json') {
					// handled by caller later — for now, report unsupported in this path
					console.warn('json import via path not wired yet');
				}
			} catch (err) {
				console.error('import failed', err);
			}
		} else if (file) {
			if (file.type.startsWith('image/')) {
				const reader = new FileReader();
				reader.onload = () => {
					engine!.imageTool.insertImage(reader.result as string, file.name, world.x, world.y);
				};
				reader.readAsDataURL(file);
			} else {
				const text = await file.text();
				insertMsWhiteboardTexts(null, text.split('\n').filter(Boolean));
			}
		}
		markDirty();
	}

	function insertMsWhiteboardTexts(title: string | null | undefined, texts: string[]) {
		if (!engine) return;
		const lines = [...(title ? [title] : []), ...texts];
		lines.forEach((line, i) => {
			const obj = createText(40 + (i % 4) * 30, 40 + i * 60, line, { fontSize: 18 });
			engine!.store.add(obj);
		});
	}

	function pickFileFallback(): Promise<File | null> {
		return new Promise((resolve) => {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml,application/zip,application/json';
			input.onchange = () => resolve(input.files?.[0] ?? null);
			input.oncancel = () => resolve(null);
			input.click();
		});
	}

	function bytesToDataUrl(bytes: number[], name: string): string {
		const mime = name.toLowerCase().endsWith('.svg')
			? 'image/svg+xml'
			: name.toLowerCase().endsWith('.jpg') || name.toLowerCase().endsWith('.jpeg')
				? 'image/jpeg'
				: name.toLowerCase().endsWith('.webp')
					? 'image/webp'
					: 'image/png';
		const b64 = btoa(String.fromCharCode(...bytes));
		return `data:${mime};base64,${b64}`;
	}

	function onKeyUp(e: KeyboardEvent) {
		if (e.code === 'Space') {
			spaceDown = false;
			if (canvasEl) canvasEl.style.cursor = 'default';
		}
	}

	// ── Touch pinch ──
	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			const [a, b] = [e.touches[0], e.touches[1]];
			pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (e.touches.length === 2) {
			const [a, b] = [e.touches[0], e.touches[1]];
			const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
			const midX = (a.clientX + b.clientX) / 2;
			const midY = (a.clientY + b.clientY) / 2;
			if (pinchDist > 0) {
				const factor = dist / pinchDist;
				camera = zoomAt(camera, midX, midY, factor);
				markDirty();
			}
			pinchDist = dist;
		}
	}

	// ── Toolbar definition (DESIGN.md — floating vertical tool strip) ──
	const TOOLBAR_TOOLS: ToolItem[] = [
		{ id: 'select', icon: 'select', label: 'Select', shortcut: 'V' },
		{ id: 'pen', icon: 'pen', label: 'Pen', shortcut: 'P' },
		{ id: 'highlighter', icon: 'highlighter', label: 'Highlighter', shortcut: 'H' },
		{ id: 'eraser', icon: 'eraser', label: 'Eraser', shortcut: 'E' },
		{ id: 'text', icon: 'text', label: 'Text', shortcut: 'T' },
		{ id: 'sticky', icon: 'sticky', label: 'Sticky Note', shortcut: 'S' },
		{ id: 'shape', icon: 'shapes', label: 'Shapes', shortcut: 'R' },
		{ id: 'image', icon: 'image', label: 'Image' },
		{ id: 'connector', icon: 'connector', label: 'Connector' }
	];
	const CREATE_ITEMS: CreateItem[] = [
		{ id: 'sticky', icon: 'sticky', label: 'Sticky note' },
		{ id: 'text', icon: 'text', label: 'Text' },
		{ id: 'shape', icon: 'shapes', label: 'Shape' },
		{ id: 'image', icon: 'image', label: 'Image' }
	];

	onMount(() => {
		if (!canvasEl) return;
		const canvas = canvasEl;

		// Shell state sync (TopBar reads ui.*; must refresh on every history change)
		engine = new CanvasEngine({
			camera: () => camera,
			onDirty: markDirty,
			onGestureEnd: () => {
				markDirty();
				updateCtxBar();
				syncShell();
			}
		});

		// TextTool → open in-canvas editor after creating a text object
		engine.textTool.onEditRequest = (obj) => openTextEditor(obj);

		// StickyNoteTool → open editor after creating a note
		engine.stickyTool.onEditRequest = (obj) => openTextEditor(obj as unknown as EditableObj);

		const resize = () => {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			markDirty();
		};
		resize();

		renderLoop = new RenderLoop(render);
		renderLoop.start();

		engine.store.onChange(() => {
			markDirty();
			scheduleAutosave();
		});

		// ── Wire shell (TopBar) actions to the engine via the UI store ──
		syncShell();
		uiActions.undo = () => { engine?.history.undo(); syncShell(); markDirty(); };
		uiActions.redo = () => { engine?.history.redo(); syncShell(); markDirty(); };
		uiActions.rename = (name: string) => { boardName = name || 'Untitled'; scheduleAutosave(); syncShell(); };
		uiActions.openSettings = () => { showSettings = true; };
		uiActions.share = () => console.log('share (future)');
		uiActions.back = () => goto('/');

		// keep shell state in sync after every store change
		engine.store.onChange(syncShell);

		// load existing board (or empty canvas for a fresh one)
		loadBoard(boardId)
			.then((board: Board) => {
				boardName = board.name;
				camera = board.camera;
				grid = board.grid ?? grid;
				if (board.objects.length > 0) {
					engine!.store.clear();
					engine!.store.addMany(board.objects);
					engine!.history.clear();
				}
				markDirty();
			})
			.catch(() => markDirty());

		window.addEventListener('resize', resize);
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('paste', onPaste);

		return () => {
			window.removeEventListener('resize', resize);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('paste', onPaste);
			renderLoop?.stop();
			if (autosaveTimer) clearTimeout(autosaveTimer);
		};
	});
</script>

<div class="canvas-wrap">
	<canvas
		bind:this={canvasEl}
		class="board-canvas"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onwheel={onWheel}
		ondblclick={onDblClick}
		ondragover={(e) => e.preventDefault()}
		ondrop={onDrop}
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		oncontextmenu={onCanvasContextMenu}
	></canvas>

	<!-- Floating tool strip (DESIGN.md) -->
	<ToolBar
		tools={TOOLBAR_TOOLS}
		activeTool={activeTool}
		onSelectTool={(t) => setTool(t as ToolId)}
		onCreate={() => (showCreatePanel = !showCreatePanel)}
		onExport={() => (showExportMenu = !showExportMenu)}
		exportActive={showExportMenu}
	>
		<!-- Contextual popover for the active tool -->
		{#if activeTool === 'shape'}
			<div class="shape-palette">
				{#each SHAPE_TYPES as shape}
					<button
						class:active={engine?.shapeTool.config.shape === shape}
						title={shape}
						onclick={() => setShape(shape)}
					>
						{shapeIcon(shape)}
					</button>
				{/each}
			</div>
		{:else if activeTool === 'sticky'}
			<div class="shape-palette">
				{#each stickyNoteColors() as color, i}
					<button
						class:active={engine?.stickyTool.currentColor === color}
						title={'Color ' + i}
						style="background: {color}; width: 26px; height: 26px; border-radius: 6px; border: 2px solid {engine?.stickyTool.currentColor === color ? '#ffffff' : 'transparent'};"
						onclick={() => engine?.stickyTool.setColor(i)}
					></button>
				{/each}
			</div>
		{/if}
	</ToolBar>

	<!-- Create panel -->
	<CreatePanel
		open={showCreatePanel}
		items={CREATE_ITEMS}
		onSelect={handleCreate}
		onClose={() => (showCreatePanel = false)}
	/>

	<!-- Export/import menu -->
	{#if showExportMenu}
		<div class="export-menu">
			<button data-testid="export-png" onclick={() => exportBoard('png')}>Export PNG</button>
			<button data-testid="export-svg" onclick={() => exportBoard('svg')}>Export SVG</button>
			<button data-testid="export-json" onclick={() => exportBoard('json')}>Export JSON</button>
			<div class="export-menu-divider"></div>
			<button data-testid="import-file" onclick={() => importFile()}>Import file…</button>
		</div>
	{/if}

	<!-- Zoom controls (DESIGN.md — bottom-right) -->
	<ZoomControls
		zoom={camera.zoom}
		onZoomIn={zoomIn}
		onZoomOut={zoomOut}
		onReset={zoomReset}
		onFit={zoomFit}
	/>

	<!-- In-canvas text editor -->
	{#if editingText}
		<TextEditor
			obj={editingText}
			camera={{ x: camera.x, y: camera.y, zoom: camera.zoom }}
			onCommit={(content) => {
				if (engine) {
					const obj = editingText!;
					// update content + resize box to fit
					obj.content = content;
					const lines = content.split('\n');
					const longest = Math.max(1, ...lines.map((l) => l.length));
					const pad = obj.style.padding ?? 4;
					const lh = obj.style.lineHeight ?? 1.3;
					obj.transform.width = Math.max(40, longest * obj.style.fontSize * 0.6 + pad * 2);
					obj.transform.height = Math.max(30, lines.length * obj.style.fontSize * lh + pad * 2);
					obj.updatedAt = Date.now();
					engine.store.notifyMoved([obj.id]);
					markDirty();
				}
				editingText = null;
			}}
			onCancel={() => {
				// if empty text was created, remove it
				if (engine && editingText && editingText.content.trim() === '') {
					engine.store.remove(editingText.id);
					markDirty();
				}
				editingText = null;
			}}
		/>
	{/if}

	{#if ctxBar}
		<ContextToolbar
			x={ctxBar.x}
			y={ctxBar.y}
			actions={ctxBar.actions}
		/>
	{/if}

	<!-- Context menu (right-click) -->
	{#if ctxMenu}
		<ContextMenu
			x={ctxMenu.x}
			y={ctxMenu.y}
			items={ctxMenu.items}
			onClose={() => (ctxMenu = null)}
		/>
	{/if}

	<!-- Command palette (Ctrl+K) -->
	<CommandPalette
		open={showPalette}
		commands={paletteCommands}
		onClose={() => (showPalette = false)}
	/>

	<!-- Settings panel -->
	<SettingsPanel
		open={showSettings}
		onClose={() => (showSettings = false)}
		grid={grid}
		onGridChange={(g) => { grid = g; markDirty(); }}
		background={'#0f1013'}
		onBgChange={() => {}}
		{theme}
		onThemeChange={(t) => {
			theme = t;
			document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
		}}
	/>
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

	button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	/* contextual popover for the active tool (inside ToolBar) */
	.shape-palette {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		align-self: center;
	}

	.shape-palette button {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		font-size: 14px;
	}

	.shape-palette button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.shape-palette button.active {
		background: var(--color-surface-active);
		color: var(--color-accent);
	}

	/* export/import menu — anchored under the floating toolbar */
	.export-menu {
		position: absolute;
		left: 64px;
		top: calc(var(--topbar-h) + 8px + 190px);
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		z-index: 25;
		min-width: 130px;
		animation: menu-in var(--dur-micro) var(--ease-out);
	}

	@keyframes menu-in {
		from {
			opacity: 0;
			transform: translateY(-3px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.export-menu button {
		width: 100%;
		padding: 6px 12px;
		text-align: left;
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		font-size: 13px;
	}

	.export-menu button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.export-menu-divider {
		height: 1px;
		background: var(--color-border);
		margin: 3px 0;
	}
</style>