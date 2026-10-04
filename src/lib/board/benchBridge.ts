// benchBridge — DEV-only hooks for the M3 benchmark harness.
// Installed by BoardCanvas in dev builds; stripped from production bundles.
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { CameraState } from '$lib/canvas/Camera';
import type { CanvasObject } from '$lib/objects/types';

export interface BenchMemory {
	usedJSHeapSize: number;
	totalJSHeapSize: number;
	jsHeapSizeLimit: number;
}

export interface BenchRuntime {
	markDirty(): void;
	session: { scheduleAutosave(): void };
}

export interface BenchBridgeDeps {
	getEngine(): CanvasEngine | null;
	getCamera(): CameraState;
	setCamera(camera: CameraState): void;
	getRuntime(): BenchRuntime | null;
}

export interface BenchBridge {
	objectCount(): number;
	selectionCount(): number;
	camera(): CameraState;
	load(objects: CanvasObject[]): void;
	setCamera(patch: Partial<CameraState>): void;
	markDirty(): void;
	scheduleAutosave(): void;
	/** ms spent by JSON.stringify on the current board (M3-06 measurement) */
	stringifyProbe(): number;
	memory(): BenchMemory | null;
}

declare global {
	interface Window {
		__inkboard?: BenchBridge;
	}
}

/** Expose the live board to the benchmark harness (no-op outside dev). */
export function installBenchBridge(deps: BenchBridgeDeps): void {
	if (!import.meta.env.DEV) return;
	window.__inkboard = {
		objectCount: () => deps.getEngine()?.store.getAll().length ?? 0,
		selectionCount: () => deps.getEngine()?.selectionManager.selected.length ?? 0,
		camera: () => ({ ...deps.getCamera() }),
		load: (objects) => {
			deps.getEngine()?.load(objects);
			deps.getRuntime()?.markDirty();
		},
		setCamera: (patch) => {
			deps.setCamera({ ...deps.getCamera(), ...patch });
			deps.getRuntime()?.markDirty();
		},
		markDirty: () => deps.getRuntime()?.markDirty(),
		scheduleAutosave: () => deps.getRuntime()?.session.scheduleAutosave(),
		stringifyProbe: () => {
			const engine = deps.getEngine();
			if (!engine) return 0;
			const objects = engine.store.toJSON();
			const start = performance.now();
			JSON.stringify({ schemaVersion: '1.1.0', version: 1, board: { objects } });
			return performance.now() - start;
		},
		memory: () => {
			const memory = (performance as Performance & { memory?: BenchMemory }).memory;
			if (!memory) return null;
			// performance.memory exposes getters, not enumerable props
			return {
				usedJSHeapSize: memory.usedJSHeapSize,
				totalJSHeapSize: memory.totalJSHeapSize,
				jsHeapSizeLimit: memory.jsHeapSizeLimit
			};
		}
	};
}
