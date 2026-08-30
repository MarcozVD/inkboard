<script lang="ts">
	import { onMount } from 'svelte';
	import { DEFAULT_CAMERA, pan, resetZoom, screenToWorld, zoomAt } from '$lib/canvas/Camera';
import type { CameraState } from '$lib/canvas/Camera';
	import { RenderLoop } from '$lib/canvas/RenderLoop';
	import type { GridConfig } from '$lib/objects/types';

	let { boardId }: { boardId: string } = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);

	// ── Engine state (lives outside Svelte reactivity — §6) ──
	let camera: CameraState = { ...DEFAULT_CAMERA };
	let grid: GridConfig = { enabled: true, size: 32, color: '#3a3d48', opacity: 0.6 };
	const gridEnabled = $state(true);

	// ── Pointer state ──
	let isPanning = false;
	let panStart = { x: 0, y: 0 };
	let cameraStart = { x: 0, y: 0 };
	let spaceDown = false;
	let lastPointer = { x: 0, y: 0 };
	let pinchDist = 0;

	let renderLoop: RenderLoop | null = null;

	function getCtx(): CanvasRenderingContext2D | null {
		return canvasEl?.getContext('2d') ?? null;
	}

	// ── Grid rendering ──
	function drawGrid(ctx: CanvasRenderingContext2D) {
		if (!grid.enabled) return;
		const { size, color, opacity } = grid;
		if (size * camera.zoom < 8) return; // too dense — skip

		const w = canvasEl!.width;
		const h = canvasEl!.height;

		// world coords of the viewport edges
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

		// Fase 3+: draw objects here
	}

	// ── Input handling ──
	function onPointerDown(e: PointerEvent) {
		lastPointer = { x: e.clientX, y: e.clientY };
		const panMode = spaceDown || e.button === 1 || e.button === 2;
		if (panMode) {
			isPanning = true;
			panStart = { x: e.clientX, y: e.clientY };
			cameraStart = { x: camera.x, y: camera.y };
			if (canvasEl) canvasEl.setPointerCapture(e.pointerId);
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (isPanning) {
			camera = pan(camera, e.clientX - panStart.x, e.clientY - panStart.y);
			// keep start anchored so movement is relative to the original grab point
			cameraStart = { x: cameraStart.x, y: cameraStart.y };
			panStart = { x: e.clientX, y: e.clientY };
			renderLoop?.markDirty();
		}
		lastPointer = { x: e.clientX, y: e.clientY };
	}

	function onPointerUp(e: PointerEvent) {
		if (isPanning) {
			isPanning = false;
			if (canvasEl) canvasEl.releasePointerCapture(e.pointerId);
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();

		// Trackpad pinch → ctrl+wheel
		if (e.ctrlKey) {
			const factor = Math.exp(-e.deltaY * 0.002);
			camera = zoomAt(camera, e.clientX, e.clientY, factor);
			renderLoop?.markDirty();
			return;
		}

		// Plain wheel → pan (natural for whiteboards)
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

<div class="canvas-wrap" class:show-grid={gridEnabled}>
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