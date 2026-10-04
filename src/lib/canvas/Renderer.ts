// Renderer — draws background, grid, objects and the selection overlay (§M1-01).
import { screenToWorld } from '$lib/canvas/Camera';
import type { CameraState } from '$lib/canvas/Camera';
import type { GridConfig } from '$lib/objects/types';
import { renderObject } from '$lib/objects/renderers';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { ObjectStore, ObjectStoreEvent } from '$lib/canvas/ObjectStore';
import { cssVar, resolveColor, type ResolvedTheme } from '$lib/objects/colors';
import { LEGACY_GRID, GRID } from '$lib/objects/colors';
import { cachedAssetUrl, isAssetSrc, resolveAssetUrl } from '$lib/io/assets';
import { profileNow, renderProfile } from '$lib/canvas/renderProfile';
import { ImageCache } from '$lib/canvas/imageCache';

export interface RendererDeps {
	canvas: () => HTMLCanvasElement | null;
	engine: () => CanvasEngine | null;
	camera: () => CameraState;
	grid: () => GridConfig;
	dpr: () => number;
	/** canvas box in CSS px */
	view: () => { width: number; height: number };
	theme: () => ResolvedTheme;
	/** object being drawn right now → static-layer fast path (M3-02) */
	liveObjectId?: () => string | null;
	/** decoded/reduced image became available → repaint (M3-03) */
	onContentReady?: () => void;
}

interface CanvasPalette {
	bg: string;
	grid: string;
	overlay: string;
	overlayFill: string;
	handle: string;
}

export class Renderer {
	private images = new ImageCache({ onReady: () => this.deps.onContentReady?.() });
	/** offscreen copy of the scene without the live draft (M3-02) */
	private staticCanvas: HTMLCanvasElement | null = null;
	private staticKey: string | null = null;
	private staticDirty = true;
	private unsubscribeStore: (() => void) | null = null;
	private subscribedStore: ObjectStore | null = null;
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
		this.ensureStoreSubscription(engine);

		// M3-02: during a draw gesture the static scene is painted once and only
		// the live draft is re-rendered per frame.
		const liveId = this.deps.liveObjectId?.() ?? null;
		const live = liveId ? engine.store.get(liveId) : undefined;
		if (live) {
			const key = `${camera.x}|${camera.y}|${camera.zoom}|${dpr}|${view.width}x${view.height}|${theme}`;
			if (this.staticDirty || !this.staticCanvas || this.staticKey !== key) {
				this.paintStatic(engine, live.id, camera, view, dpr, theme);
				this.staticKey = key;
				this.staticDirty = false;
			}
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			if (this.staticCanvas) ctx.drawImage(this.staticCanvas, 0, 0);
			ctx.save();
			ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, dpr * camera.x, dpr * camera.y);
			renderObject(ctx, live, {
				getImage: (src) => this.imageSource(src, camera.zoom),
				theme,
				zoom: camera.zoom
			});
			ctx.restore();
		} else {
			this.staticKey = null;
			this.paintScene(ctx, engine, camera, view, dpr, theme, null);
		}

		const overlayStart = profileNow();
		this.drawSelectionOverlay(ctx, engine, camera, dpr);
		if (renderProfile.enabled) renderProfile.add('overlay', profileNow() - overlayStart);
	}

	/** Scene painter shared by the live canvas and the static layer. */
	private paintScene(
		ctx: CanvasRenderingContext2D,
		engine: CanvasEngine,
		camera: CameraState,
		view: { width: number; height: number },
		dpr: number,
		theme: ResolvedTheme,
		excludeId: string | null
	): void {
		const profiling = renderProfile.enabled;
		if (profiling) renderProfile.bump('frames');
		let mark = profileNow();

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = this.palette.bg;
		ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		this.drawGrid(ctx, camera, view.width, view.height, dpr);
		if (profiling) renderProfile.add('bg+grid', profileNow() - mark);

		// viewport culling (§19)
		mark = profileNow();
		const [wx0, wy0] = screenToWorld(0, 0, camera);
		const [wx1, wy1] = screenToWorld(view.width, view.height, camera);
		const visible = engine.store.queryViewport({
			x: wx0,
			y: wy0,
			width: wx1 - wx0,
			height: wy1 - wy0
		});
		if (profiling) {
			renderProfile.add('query+sort', profileNow() - mark);
			renderProfile.bump('visible', visible.length);
		}

		mark = profileNow();
		ctx.save();
		ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, dpr * camera.x, dpr * camera.y);
		const options = {
			getImage: (src: string) => this.imageSource(src, camera.zoom),
			theme,
			zoom: camera.zoom
		};
		for (const obj of visible) {
			if (obj.id === excludeId) continue;
			if (profiling) {
				const objectStart = profileNow();
				renderObject(ctx, obj, options);
				renderProfile.add(`render:${obj.type}`, profileNow() - objectStart);
			} else {
				renderObject(ctx, obj, options);
			}
		}

		// M3-05: objects dragged without a spatial re-sync are drawn even when
		// the stale index says they left the viewport.
		const deferred = engine.store.deferredObjects();
		if (deferred.length > 0) {
			const seen = new Set<string>();
			for (const obj of visible) seen.add(obj.id);
			for (const obj of deferred) {
				if (obj.id === excludeId || seen.has(obj.id)) continue;
				renderObject(ctx, obj, options);
			}
		}
		ctx.restore();
		if (profiling) renderProfile.add('render:total', profileNow() - mark);
	}

	private paintStatic(
		engine: CanvasEngine,
		excludeId: string,
		camera: CameraState,
		view: { width: number; height: number },
		dpr: number,
		theme: ResolvedTheme
	): void {
		const canvas = this.deps.canvas();
		if (!canvas) return;
		if (!this.staticCanvas) this.staticCanvas = document.createElement('canvas');
		if (this.staticCanvas.width !== canvas.width || this.staticCanvas.height !== canvas.height) {
			this.staticCanvas.width = canvas.width;
			this.staticCanvas.height = canvas.height;
		}
		const staticCtx = this.staticCanvas.getContext('2d');
		if (!staticCtx) return;
		this.paintScene(staticCtx, engine, camera, view, dpr, theme, excludeId);
	}

	/** Force the next gesture frame to rebuild the static layer. */
	invalidateStatic(): void {
		this.staticDirty = true;
	}

	private ensureStoreSubscription(engine: CanvasEngine): void {
		const store = engine.store;
		if (this.subscribedStore === store) return;
		this.unsubscribeStore?.();
		this.subscribedStore = store;
		this.unsubscribeStore = store.onChange((ev) => this.onStoreChange(ev));
	}

	private onStoreChange(ev: ObjectStoreEvent): void {
		const liveId = this.deps.liveObjectId?.() ?? null;
		const onlyLive =
			liveId !== null &&
			ev.added.length === 0 &&
			ev.removed.length === 0 &&
			ev.modified.length > 0 &&
			ev.modified.every((id) => id === liveId);
		if (!onlyLive) this.staticDirty = true;
	}

	dispose(): void {
		this.unsubscribeStore?.();
		this.unsubscribeStore = null;
		this.subscribedStore = null;
		this.staticCanvas = null;
		this.staticKey = null;
		this.images.clear();
	}

	/** Resolve `asset:` sources and serve a ready decoded image (M3-03/M3-04). */
	private imageSource(src: string, zoom: number): CanvasImageSource | undefined {
		let url = src;
		if (isAssetSrc(src)) {
			const cached = cachedAssetUrl(src);
			if (!cached) {
				// resolve in the background; onAssetResolved triggers a repaint
				void resolveAssetUrl(src);
				return undefined;
			}
			url = cached;
		}
		return this.images.getForZoom(url, zoom);
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
