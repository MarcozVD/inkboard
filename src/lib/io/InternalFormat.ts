// Internal format serialization — full board to/from JSON (§16).
import type { Board, CameraState, CanvasObject } from '$lib/objects/types';
import { DEFAULT_CAMERA } from '$lib/canvas/Camera';

export const SCHEMA_VERSION = '1.0.0';

export interface BoardFile {
	schemaVersion: string;
	version: number;
	board: Board;
}

/** Serialize the full board to a JSON string (objects already sorted by z). */
export function serializeBoard(board: Board): string {
	const file: BoardFile = {
		schemaVersion: SCHEMA_VERSION,
		version: board.version,
		board
	};
	return JSON.stringify(file);
}

/**
 * Deserialize a board from JSON with minimal validation.
 * Throws on structurally invalid data (missing required fields).
 */
export function deserializeBoard(json: string): Board {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('deserializeBoard: invalid JSON');
	}

	const file = parsed as BoardFile;
	if (!file || typeof file !== 'object' || !file.board) {
		throw new Error('deserializeBoard: missing board object');
	}
	const b = file.board as Partial<Board>;
	if (typeof b.id !== 'string' || !Array.isArray(b.objects)) {
		throw new Error('deserializeBoard: invalid board structure');
	}

	const camera = normalizeCamera(b.camera);
	return {
		id: b.id,
		workspaceId: b.workspaceId ?? 'default',
		name: b.name ?? 'Untitled',
		version: typeof b.version === 'number' ? b.version : 1,
		schemaVersion: file.schemaVersion ?? SCHEMA_VERSION,
		createdAt: b.createdAt ?? Date.now(),
		updatedAt: b.updatedAt ?? Date.now(),
		camera,
		objects: (b.objects as CanvasObject[]).map(normalizeObject),
		background: b.background ?? { type: 'solid', color: '#0f1013' },
		grid: b.grid ?? { enabled: true, size: 32, color: '#2a2d34', opacity: 0.6 },
		metadata: b.metadata ?? {}
	};
}

function normalizeCamera(c?: Partial<CameraState>): CameraState {
	return {
		x: typeof c?.x === 'number' ? c.x : DEFAULT_CAMERA.x,
		y: typeof c?.y === 'number' ? c.y : DEFAULT_CAMERA.y,
		zoom: typeof c?.zoom === 'number' ? c.zoom : DEFAULT_CAMERA.zoom,
		minZoom: typeof c?.minZoom === 'number' ? c.minZoom : DEFAULT_CAMERA.minZoom,
		maxZoom: typeof c?.maxZoom === 'number' ? c.maxZoom : DEFAULT_CAMERA.maxZoom
	};
}

function normalizeObject(o: CanvasObject): CanvasObject {
	if (!o.id || !o.type) throw new Error('deserializeBoard: object missing id/type');
	const base = {
		id: o.id,
		type: o.type,
		transform: {
			x: o.transform?.x ?? 0,
			y: o.transform?.y ?? 0,
			width: o.transform?.width ?? 0,
			height: o.transform?.height ?? 0,
			rotation: o.transform?.rotation ?? 0,
			scaleX: o.transform?.scaleX ?? 1,
			scaleY: o.transform?.scaleY ?? 1
		},
		zIndex: o.zIndex ?? 0,
		locked: o.locked ?? false,
		visible: o.visible ?? true,
		createdAt: o.createdAt ?? Date.now(),
		updatedAt: o.updatedAt ?? Date.now()
	};
	// carry the rest (type-specific fields + style) through as-is
	return { ...base, ...o } as CanvasObject;
}
