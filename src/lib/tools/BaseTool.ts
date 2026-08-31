// Base tool interface — every canvas tool implements this (§5)
import type { ObjectStore } from '$lib/canvas/ObjectStore';
import type { CameraState } from '$lib/canvas/Camera';

export interface ToolPointerEvent {
	screenX: number;
	screenY: number;
	/** 0..1 — pressure (pointerEvent.pressure); 0.5 default for mouse */
	pressure: number;
	shift: boolean;
	button: number;
}

export interface ToolContext {
	store: ObjectStore;
	camera: () => CameraState;
	onDirty: () => void;
	/** called after a gesture ends that should be a single undo step */
	onGestureEnd?: () => void;
}

export abstract class BaseTool {
	constructor(protected ctx: ToolContext) {}

	abstract pointerDown(e: ToolPointerEvent): void;
	abstract pointerMove(e: ToolPointerEvent): void;
	abstract pointerUp(e: ToolPointerEvent): void;
	/** called when the tool is deselected mid-gesture */
	reset(): void {}
}
