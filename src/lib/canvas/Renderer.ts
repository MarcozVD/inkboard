// Renderer — draws background, grid, objects and the selection overlay (§M1-01).
import { screenToWorld } from '$lib/canvas/Camera';
import type { CameraState } from '$lib/canvas/Camera';
import type { GridConfig } from '$lib/objects/types';
import { renderObject } from '$lib/objects/renderers';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { cssVar, resolveColor, type ResolvedTheme } from '$lib/objects/colors';
import { LEGACY_GRID, GRID } from '$lib/objects/colors';

export interface RendererDeps {
	canvas: () => HTMLCanvasElement | null;
	engine: () => CanvasEngine | null;
	camera: () => CameraState;
	grid: () => GridConfig;
	dpr: () => number;
	/** canvas box in CSS px */
	view: () => { width: number; height: number };
	theme: () => ResolvedTheme;
}

interface CanvasPalette {
	bg: string;
	grid: string;
	overlay: string;
	overlayFill: string;
	handle: string;
}

export class Renderer {
	private imageCache = new Map<string, HTMLImageElement>();
	private paletteTheme: ResolvedTheme | null = null;
	private palette: CanvasPalette = {
		bg: '#0f1013',
		grid: '#2a2d34',
		overlay: 'rgba(255,255,255,0.9)',
		overlayFill: 'rgba(255,255,255,0.12)',
		handle: '#ffffff'
	};

	constructor(private deps: RendererDeps) {}

	/** Palette from the CSS tokens, refreshed when the theme changes. */
	private refreshPalette(theme: ResolvedTheme): void {
		if (theme === this.paletteTheme) return;
		this.paletteTheme = theme;
		this.palette = {
			bg: cssVar('--color-bg', theme === 'light' ? '#f5f5f7' : '#0f1013'),
			grid: cssVar('--color-grid', theme === 'light' ? '#e2e2e8' : '#2a2d34'),
			overlay: cssVar('--color-selection', 'rgba(255,255,255,0.9)'),
			overlayFill: cssVar('--color-selection-fill', 'rgba(255,255,255,0.12)'),
			handle: cssVar('--color-text', '#ffffff')
		};
	}

	/** Full frame: background, grid, visible objects (z-order), selection overlay. */
	render(): void {
		const canvas = this.deps.canvas();
		const ctx = canvas?.getContext('2d') ?? null;
		const engine = this.deps.engine();
		if (!canvas || !ctx || !engine) return;
		const camera = this.deps.camera();
		const dpr = this.deps.dpr();
		const view = this.deps.view();
		const theme = this.deps.theme();
		this.refreshPalette(theme);

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = this.palette.bg;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		this.drawGrid(ctx, camera, view.width, view.height, dpr);

		// viewport culling (§19)
		const [wx0, wy0] = screenToWorld(0, 0, camera);
		const [wx1, wy1] = screenToWorld(view.width, view.height, camera);
		const visible = engine.store.queryViewport({
			x: wx0,
			y: wy0,
			width: wx1 - wx0,
			height: wy1 - wy0
		});

		ctx.save();
		ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, dpr * camera.x, dpr * camera.y);
		for (const obj of visible) {
			renderObject(ctx, obj, { getImage: (src) => this.getImage(src), theme });
		}
		ctx.restore();

		this.drawSelectionOverlay(ctx, engine, camera, dpr);
	}

	private getImage(src: string): HTMLImageElement | undefined {
		let img = this.imageCache.get(src);
		if (!img) {
			img = new Image();
			img.src = src;
			this.imageCache.set(src, img);
		}
		return img;
	}

	private worldToScreen(camera: CameraState, wx: number, wy: number): [number, number] {
		return [wx * camera.zoom + camera.x, wy * camera.zoom + camera.y];
	}

	private drawLockBadge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
		ctx.save();
		ctx.fillStyle = this.palette.handle;
		ctx.strokeStyle = this.palette.overlay;
		ctx.lineWidth = 1.5;
		ctx.fillRect(x - 6, y - 4, 12, 9);
		ctx.beginPath();
		ctx.arc(x, y - 4, 4, Math.PI, 0);
		ctx.stroke();
		ctx.restore();
	}

	private drawGrid(
		ctx: CanvasRenderingContext2D,
		camera: CameraState,
		width: number,
		height: number,
		dpr: number
	): void {
		const grid = this.deps.grid();
		if (!grid.enabled) return;
		const { size, opacity } = grid;
		const color =
			grid.color === GRID || grid.color === LEGACY_GRID
				? this.palette.grid
				: resolveColor(grid.color, this.paletteTheme ?? 'dark');
		if (size * camera.zoom < 8) return;

		const [wx0, wy0] = screenToWorld(0, 0, camera);
		const [wx1, wy1] = screenToWorld(width, height, camera);
		const startX = Math.floor(wx0 / size) * size;
		const startY = Math.floor(wy0 / size) * size;

		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.strokeStyle = color;
		ctx.globalAlpha = opacity;
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let x = startX; x <= wx1; x += size) {
			const [sx] = this.worldToScreen(camera, x, 0);
			ctx.moveTo(sx, 0);
			ctx.lineTo(sx, height);
		}
		for (let y = startY; y <= wy1; y += size) {
			const [, sy] = this.worldToScreen(camera, 0, y);
			ctx.moveTo(0, sy);
			ctx.lineTo(width, sy);
		}
		ctx.stroke();
		ctx.restore();
	}

	private drawSelectionOverlay(
		ctx: CanvasRenderingContext2D,
		engine: CanvasEngine,
		camera: CameraState,
		dpr: number
	): void {
		const sel = engine.selectionManager;
		if (sel.selected.length === 0) return;

		const bounds = sel.getSelectionBounds();
		if (!bounds) return;

		const [x0, y0] = this.worldToScreen(camera, bounds.x, bounds.y);
		const [x1, y1] = this.worldToScreen(camera, bounds.x + bounds.width, bounds.y + bounds.height);
		const sx = Math.min(x0, x1);
		const sy = Math.min(y0, y1);
		const sw = Math.abs(x1 - x0);
		const sh = Math.abs(y1 - y0);

		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.strokeStyle = this.palette.overlay;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 3]);
		ctx.strokeRect(sx, sy, sw, sh);
		ctx.setLineDash([]);

		const handles = sel.getHandles((wx, wy) => this.worldToScreen(camera, wx, wy));
		for (const h of handles) {
			ctx.fillStyle = this.palette.handle;
			ctx.strokeStyle = this.palette.overlay;
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

		// lock indicator (§M1-06)
		if (sel.selected.some((id) => engine.store.get(id)?.locked)) {
			this.drawLockBadge(ctx, sx + sw + 9, sy - 9);
		}
		ctx.restore();

		// rect-select marquee (via selectTool)
		const marquee = (
			engine.selectTool as unknown as {
				getActiveRectSelect?: () => { x: number; y: number; width: number; height: number } | null;
			}
		).getActiveRectSelect?.();
		if (marquee) {
			const [mx0, my0] = this.worldToScreen(camera, marquee.x, marquee.y);
			const [mx1, my1] = this.worldToScreen(camera, marquee.x + marquee.width, marquee.y + marquee.height);
			ctx.save();
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = this.palette.overlayFill;
			ctx.strokeStyle = this.palette.overlay;
			ctx.lineWidth = 1;
			ctx.fillRect(mx0, my0, mx1 - mx0, my1 - my0);
			ctx.strokeRect(mx0, my0, mx1 - mx0, my1 - my0);
			ctx.restore();
		}
	}
}
