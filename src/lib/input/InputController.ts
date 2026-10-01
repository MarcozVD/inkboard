// InputController — pointer events, wheel and pinch on the canvas (§M1-01).
// Pinch is implemented with Pointer Events; no duplicate touch listeners.
import { pan, zoomAt } from '$lib/canvas/Camera';
import type { CameraState } from '$lib/canvas/Camera';
import type { Vec2 } from '$lib/utils/math';

export interface PointerLike {
	pointerId: number;
	button: number;
	shiftKey: boolean;
	pressure: number;
	clientX: number;
	clientY: number;
	preventDefault?: () => void;
}

export interface WheelLike {
	deltaX: number;
	deltaY: number;
	ctrlKey: boolean;
	clientX: number;
	clientY: number;
	preventDefault?: () => void;
}

export interface InputControllerOptions {
	canvas: () => HTMLCanvasElement | null;
	isSpaceDown: () => boolean;
	getCamera: () => CameraState;
	setCamera: (camera: CameraState) => void;
	onToolPointerDown: (p: Vec2, e: PointerLike) => void;
	onToolPointerMove: (p: Vec2, e: PointerLike) => void;
	onToolPointerUp: (e: PointerLike) => void;
	onDirty: () => void;
	/** canvas box / dpr changed after a resize */
	onResize?: () => void;
}

export class InputController {
	/** canvas box in CSS px inside the viewport */
	rect = { left: 0, top: 0, width: 0, height: 0 };
	dpr = 1;
	/** last pointer position in canvas-local CSS px (for paste-at-cursor) */
	lastPointer: Vec2 | null = null;

	private isPanning = false;
	private panStart: Vec2 = { x: 0, y: 0 };
	private pointers = new Map<number, Vec2>();
	private pinchDist = 0;
	private pinching = false;
	private resizeObserver: ResizeObserver | null = null;

	constructor(private opts: InputControllerOptions) {}

	/** Single entry point for pointer → canvas-local CSS px (B02). */
	toCanvasPoint(e: { clientX: number; clientY: number }): Vec2 {
		return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top };
	}

	/** Backing store = CSS size × devicePixelRatio; tracks the container size (B02). */
	syncSize(): void {
		const canvas = this.opts.canvas();
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		this.dpr = window.devicePixelRatio || 1;
		this.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
		const bw = Math.max(1, Math.round(rect.width * this.dpr));
		const bh = Math.max(1, Math.round(rect.height * this.dpr));
		if (canvas.width !== bw) canvas.width = bw;
		if (canvas.height !== bh) canvas.height = bh;
		this.opts.onResize?.();
	}

	attach(): () => void {
		const canvas = this.opts.canvas();
		if (!canvas) return () => {};
		const down = (e: PointerEvent) => this.pointerDown(e);
		const move = (e: PointerEvent) => this.pointerMove(e);
		const up = (e: PointerEvent) => this.pointerUp(e);
		const wheel = (e: WheelEvent) => this.wheel(e);

		canvas.addEventListener('pointerdown', down);
		canvas.addEventListener('pointermove', move);
		canvas.addEventListener('pointerup', up);
		canvas.addEventListener('pointercancel', up);
		canvas.addEventListener('wheel', wheel, { passive: false });

		const onWindowResize = () => this.syncSize();
		window.addEventListener('resize', onWindowResize);
		this.resizeObserver = new ResizeObserver(() => this.syncSize());
		this.resizeObserver.observe(canvas);
		this.syncSize();

		return () => {
			canvas.removeEventListener('pointerdown', down);
			canvas.removeEventListener('pointermove', move);
			canvas.removeEventListener('pointerup', up);
			canvas.removeEventListener('pointercancel', up);
			canvas.removeEventListener('wheel', wheel);
			window.removeEventListener('resize', onWindowResize);
			this.resizeObserver?.disconnect();
			this.resizeObserver = null;
		};
	}

	pointerDown(e: PointerLike): void {
		e.preventDefault?.();
		const canvas = this.opts.canvas();
		const p = this.toCanvasPoint(e);
		this.lastPointer = { ...p };
		this.pointers.set(e.pointerId, p);

		if (this.pointers.size === 2) {
			const [a, b] = [...this.pointers.values()];
			this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
			this.pinching = true;
			return;
		}
		if (this.pointers.size > 2) return;

		const panMode = this.opts.isSpaceDown() || e.button === 1 || e.button === 2;
		if (panMode) {
			this.isPanning = true;
			this.panStart = { ...p };
			canvas?.setPointerCapture(e.pointerId);
		} else {
			this.opts.onToolPointerDown(p, e);
		}
	}

	pointerMove(e: PointerLike): void {
		const p = this.toCanvasPoint(e);
		this.lastPointer = { ...p };
		if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);

		if (this.pointers.size >= 2) {
			const [a, b] = [...this.pointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			if (this.pinchDist > 0 && dist > 0) {
				const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				this.opts.setCamera(zoomAt(this.opts.getCamera(), mid.x, mid.y, dist / this.pinchDist));
				this.opts.onDirty();
			}
			this.pinchDist = dist;
			return;
		}

		if (this.isPanning) {
			const camera = this.opts.getCamera();
			this.opts.setCamera(pan(camera, p.x - this.panStart.x, p.y - this.panStart.y));
			this.panStart = { ...p };
			this.opts.onDirty();
			return;
		}

		this.opts.onToolPointerMove(p, e);
	}

	pointerUp(e: PointerLike): void {
		const wasPinching = this.pointers.size >= 2;
		this.pointers.delete(e.pointerId);

		if (this.isPanning) {
			this.isPanning = false;
			this.opts.canvas()?.releasePointerCapture(e.pointerId);
			return;
		}
		if (this.pointers.size === 0) this.pinching = false;
		if (!wasPinching && !this.pinching) this.opts.onToolPointerUp(e);
	}

	wheel(e: WheelLike): void {
		e.preventDefault?.();
		const p = this.toCanvasPoint(e);
		if (e.ctrlKey) {
			const factor = Math.exp(-e.deltaY * 0.002);
			this.opts.setCamera(zoomAt(this.opts.getCamera(), p.x, p.y, factor));
		} else {
			this.opts.setCamera(pan(this.opts.getCamera(), -e.deltaX, -e.deltaY));
		}
		this.opts.onDirty();
	}
}
