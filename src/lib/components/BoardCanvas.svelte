<script lang="ts">
	import { onMount } from 'svelte';
	import { DEFAULT_CAMERA, pan, resetZoom, screenToWorld, zoomAt } from '$lib/canvas/Camera';
	import type { CameraState } from '$lib/canvas/Camera';
	import { RenderLoop } from '$lib/canvas/RenderLoop';
	import { ObjectStore } from '$lib/canvas/ObjectStore';
	import { SelectTool } from '$lib/tools/SelectTool';
	import { renderObject } from '$lib/objects/renderers';
	import type { GridConfig, CanvasObject } from '$lib/objects/types';
	import { createShape } from '$lib/objects/factory';
	import { v4 as uuidv4 } from 'uuid';

	let { boardId }: { boardId: string } = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);

	// ── Engine state (lives outside Svelte reactivity — §6) ──
	let camera: CameraState = { ...DEFAULT_CAMERA };
	let grid: GridConfig = { enabled: true, size: 32, color: '#3a3d48', opacity: 0.6 };

	const store = new ObjectStore();
	const selectTool = new SelectTool(store, () => camera, {
		onDirty: () => renderLoop?.markDirty(),
		onGestureEnd: () => renderLoop?.markDirty()
	});

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

	let renderLoop: RenderLoop | null = null;

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
		if (!ctx || !canvasEl) return;
		const w = canvasEl.width;
		const h = canvasEl.height;

		ctx.fillStyle = '#1e1f24';
		ctx.fillRect(0, 0, w, h);

		drawGrid(ctx);

		// viewport culling (§19)
		const [wx0, wy0] = screenToWorld(0, 0, camera);
		const [wx1, wy1] = screenToWorld(w, h, camera);
		const viewport = { x: wx0, y: wy0, width: wx1 - wx0, height: wy1 - wy0 };
		const visible = store.queryViewport(viewport);

		ctx.save();
		ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);
		for (const obj of visible) {
			renderObject(ctx, obj, { getImage });
		}
		ctx.restore();

		// selection overlay (screen space)
		renderSelectionOverlay(ctx);
	}

	function renderSelectionOverlay(ctx: CanvasRenderingContext2D) {
		const sel = selectTool.selectionManager;
		if (sel.selected.length === 0) return;

		const bounds = selectTool.getSelectionScreenBounds();
		if (!bounds) return;

		// world rect → screen rect
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

		// handles
		const handles = selectTool.selectionManager.getHandles(worldToScreenHelper);
		for (const h of handles) {
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = '#5b8cff';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			if (h.id === 'rotate') {
				// rotation: circle above
				ctx.arc(h.position.x, h.position.y, 5, 0, Math.PI * 2);
				// connector line to top edge
				ctx.moveTo(sx + sw / 2, sy);
				ctx.lineTo(h.position.x, h.position.y + 5);
			} else {
				ctx.rect(h.position.x - 4, h.position.y - 4, 8, 8);
			}
			ctx.fill();
			ctx.stroke();
		}
		ctx.restore();

		// rect-select marquee
		const marquee = selectTool.getActiveRectSelect();
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
		const panMode = spaceDown || e.button === 1 || e.button === 2;
		if (panMode) {
			isPanning = true;
			panStart = { x: e.clientX, y: e.clientY };
			if (canvasEl) canvasEl.setPointerCapture(e.pointerId);
		} else {
			selectTool.pointerDown(e.clientX, e.clientY, { shift: e.shiftKey });
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (isPanning) {
			camera = pan(camera, e.clientX - panStart.x, e.clientY - panStart.y);
			panStart = { x: e.clientX, y: e.clientY };
			renderLoop?.markDirty();
		} else {
			selectTool.pointerMove(e.clientX, e.clientY, { shift: e.shiftKey });
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (isPanning) {
			isPanning = false;
			if (canvasEl) canvasEl.releasePointerCapture(e.pointerId);
		} else {
			selectTool.pointerUp();
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		if (e.ctrlKey) {
			const factor = Math.exp(-e.deltaY * 0.002);
			camera = zoomAt(camera, e.clientX, e.clientY, factor);
			renderLoop?.markDirty();
			return;
		}
		camera = pan(camera, -e.deltaX, -e.deltaY);
		renderLoop?.markDirty();
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.code === 'Space' && !e.repeat) {
			spaceDown = true;
			if (canvasEl) canvasEl.style.cursor = 'grab';
		}
		if (e.key === '+' || e.key === '=') {
			camera = zoomAt(camera, canvasEl!.width / 2, canvasEl!.height / 2, 1.25);
			renderLoop?.markDirty();
		}
		if (e.key === '-') {
			camera = zoomAt(camera, canvasEl!.width / 2, canvasEl!.height / 2, 0.8);
			renderLoop?.markDirty();
		}
		if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			camera = resetZoom(camera, canvasEl!.width, canvasEl!.height);
			renderLoop?.markDirty();
		}

		// ── Fase 4: selection shortcuts ──
		const sel = selectTool.selectionManager;
		const mod = e.ctrlKey || e.metaKey;

		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (sel.selected.length) {
				e.preventDefault();
				store.removeMany(sel.selected);
				sel.clear();
				renderLoop?.markDirty();
			}
		}
		if (mod && (e.key === 'd' || e.key === 'D')) {
			e.preventDefault();
			duplicateSelection();
		}
		if (mod && (e.key === 'a' || e.key === 'A')) {
			e.preventDefault();
			sel.selectMany(store.getAll().map((o) => o.id));
			renderLoop?.markDirty();
		}
		if (e.key === 'Escape') {
			sel.clear();
			renderLoop?.markDirty();
		}
		if (e.key === ']') {
			e.preventDefault();
			store.bringToFront(sel.selected);
			renderLoop?.markDirty();
		}
		if (e.key === '[') {
			e.preventDefault();
			store.sendToBack(sel.selected);
			renderLoop?.markDirty();
		}
	}

	function duplicateSelection() {
		const sel = selectTool.selectionManager;
		if (sel.selected.length === 0) return;
		const clones: CanvasObject[] = [];
		const idMap = new Map<string, string>();
		for (const id of sel.selected) {
			const obj = store.get(id);
			if (!obj) continue;
			const newId = uuidv4();
			idMap.set(id, newId);
			const clone = structuredClone(obj);
			clone.id = newId;
			clone.transform.x += 20;
			clone.transform.y += 20;
			clone.createdAt = Date.now();
			clone.updatedAt = Date.now();
			clones.push(clone);
		}
		store.addMany(clones);
		sel.selectMany(clones.map((c) => c.id));
		renderLoop?.markDirty();
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
				renderLoop?.markDirty();
			}
			pinchDist = dist;
		}
	}

	// ── Fase 3: demo objects (dev only) ──
	function seedDemoObjects() {
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
		store.addMany(objs);
		renderLoop?.markDirty();
	}

	onMount(() => {
		if (!canvasEl) return;
		const canvas = canvasEl;

		const resize = () => {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			renderLoop?.markDirty();
		};
		resize();

		renderLoop = new RenderLoop(render);
		renderLoop.start();

		store.onChange(() => renderLoop?.markDirty());
		seedDemoObjects();

		window.addEventListener('resize', resize);
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);

		return () => {
			window.removeEventListener('resize', resize);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
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
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		oncontextmenu={(e) => e.preventDefault()}
	></canvas>
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