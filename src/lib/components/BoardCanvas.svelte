<script lang="ts">
	import { onMount } from 'svelte';
	import { DEFAULT_CAMERA, pan, resetZoom, screenToWorld, zoomAt } from '$lib/canvas/Camera';
	import type { CameraState } from '$lib/canvas/Camera';
	import { RenderLoop } from '$lib/canvas/RenderLoop';
	import { CanvasEngine, type ToolId } from '$lib/canvas/CanvasEngine';
	import { renderObject } from '$lib/objects/renderers';
	import type { GridConfig, CanvasObject } from '$lib/objects/types';
	import { createShape } from '$lib/objects/factory';
	import { v4 as uuidv4 } from 'uuid';
	import TextEditor from '$lib/components/TextEditor.svelte';
	import type { TextObject } from '$lib/objects/types';
	import { SHAPE_TYPES } from '$lib/tools/ShapeTool';
	import type { ShapeType } from '$lib/objects/types';

	let { boardId }: { boardId: string } = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let activeTool = $state<ToolId>('select');
	let editingText = $state<TextObject | null>(null);

	// ── Engine state (lives outside Svelte reactivity — §6) ──
	let camera: CameraState = $state({ ...DEFAULT_CAMERA });
	let grid: GridConfig = { enabled: true, size: 32, color: '#3a3d48', opacity: 0.6 };

	let renderLoop: RenderLoop | null = null;
	let engine: CanvasEngine | null = $state(null);

	function markDirty() {
		renderLoop?.markDirty();
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

		ctx.fillStyle = '#1e1f24';
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
		ctx.strokeStyle = '#5b8cff';
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 3]);
		ctx.strokeRect(sx, sy, sw, sh);
		ctx.setLineDash([]);

		const handles = sel.getHandles(worldToScreenHelper);
		for (const h of handles) {
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = '#5b8cff';
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
			ctx.fillStyle = 'rgba(91,140,255,0.12)';
			ctx.strokeStyle = '#5b8cff';
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

	function openTextEditor(obj: TextObject) {
		editingText = obj;
	}

	function onDblClick(e: MouseEvent) {
		if (!engine || activeTool !== 'select') return;
		const c = camera;
		const wx = (e.clientX - c.x) / c.zoom;
		const wy = (e.clientY - c.y) / c.zoom;
		const hit = engine.selectionManager.hitTest({ x: wx, y: wy });
		if (hit && hit.type === 'text') {
			openTextEditor(hit as TextObject);
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

		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (sel.selected.length) {
				e.preventDefault();
				engine.store.removeMany(sel.selected);
				sel.clear();
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
			markDirty();
		}
		if (e.key === 'Escape') {
			sel.clear();
			markDirty();
		}
		if (e.key === ']') {
			e.preventDefault();
			engine.store.bringToFront(sel.selected);
			markDirty();
		}
		if (e.key === '[') {
			e.preventDefault();
			engine.store.sendToBack(sel.selected);
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
		markDirty();
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

	// ── Toolbar icons (inline emoji for MVP; SVG later) ──
	const TOOLBAR_TOOLS: ToolId[] = ['select', 'pen', 'highlighter', 'eraser', 'text', 'sticky', 'shape', 'image'];

	function iconFor(tool: ToolId): string {
		const icons: Record<ToolId, string> = {
			select: '↖',
			pen: '✏️',
			highlighter: '🖍️',
			eraser: '🧽',
			text: 'T',
			sticky: '📝',
			shape: '⬛',
			image: '🖼️',
			connector: '➡'
		};
		return icons[tool];
	}

	// ── Fase 3: demo objects (dev only) ──
	function seedDemoObjects() {
		if (!engine) return;
		const colors = ['#5b8cff', '#ff8c5b', '#5bff8c', '#ffd666', '#b08cff', '#ff8cbf'];
		const objs: CanvasObject[] = [];
		for (let i = 0; i < 200; i++) {
			const x = (Math.random() - 0.5) * 4000;
			const y = (Math.random() - 0.5) * 4000;
			const w = 60 + Math.random() * 160;
			const h = 60 + Math.random() * 160;
			objs.push(
				createShape(x, y, w, h, 'rect', {
					fill: colors[i % colors.length] + '33',
					stroke: colors[i % colors.length],
					strokeWidth: 2
				})
			);
		}
		engine.store.addMany(objs);
		markDirty();
	}

	onMount(() => {
		if (!canvasEl) return;
		const canvas = canvasEl;

		engine = new CanvasEngine({
			camera: () => camera,
			onDirty: markDirty
		});

		// TextTool → open in-canvas editor after creating a text object
		engine.textTool.onEditRequest = (obj) => openTextEditor(obj);

		const resize = () => {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			markDirty();
		};
		resize();

		renderLoop = new RenderLoop(render);
		renderLoop.start();

		engine.store.onChange(() => markDirty());
		seedDemoObjects();

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
		oncontextmenu={(e) => e.preventDefault()}
	></canvas>

	<!-- Toolbar -->
	<div class="toolbar">
		{#each TOOLBAR_TOOLS as tool}
			<button
				class:active={activeTool === tool}
				title={tool}
				onclick={() => setTool(tool)}
			>
				{iconFor(tool)}
			</button>
		{/each}
	</div>

	<!-- Shape palette (visible when shape tool is active) -->
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
	{/if}

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
					obj.transform.width = Math.max(40, longest * obj.style.fontSize * 0.6 + obj.style.padding * 2);
					obj.transform.height = Math.max(30, lines.length * obj.style.fontSize * obj.style.lineHeight + obj.style.padding * 2);
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

	.toolbar {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 2px;
		padding: 4px;
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
		z-index: 10;
	}

	.toolbar button {
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 7px;
		color: var(--text-secondary);
		font-size: 16px;
	}

	.toolbar button:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.toolbar button.active {
		background: var(--accent);
		color: #fff;
	}

	.shape-palette {
		position: absolute;
		top: 62px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 2px;
		padding: 4px;
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 10;
	}

	.shape-palette button {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 14px;
	}

	.shape-palette button:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.shape-palette button.active {
		background: var(--accent);
		color: #fff;
	}
</style>