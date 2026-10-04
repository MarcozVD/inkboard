// importBoard — M2-07: internal JSON import (schema validation, limits, apply).
import { v4 as uuidv4 } from 'uuid';
import { deserializeBoard } from '$lib/io/InternalFormat';
import { assetifyImages } from '$lib/io/assets';
import { saveBoard } from '$lib/io/persistence';
import { AddObjectsCommand } from '$lib/canvas/commands';
import { remapClipboardObjects } from '$lib/board/clipboard';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type { Board } from '$lib/objects/types';

/** Limits mirroring the Rust side (M2-07 / plan §22). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_OBJECTS = 10_000;

export interface ImportLimits {
	maxBytes?: number;
	maxObjects?: number;
}

/**
 * Validate an internal board JSON payload and normalize it.
 * Throws with a readable message when the schema or a limit is violated.
 */
export function validateBoardFile(json: string, limits: ImportLimits = {}): Board {
	const maxBytes = limits.maxBytes ?? MAX_IMPORT_BYTES;
	const maxObjects = limits.maxObjects ?? MAX_IMPORT_OBJECTS;
	if (json.length > maxBytes) throw new Error(`import too large (${json.length} bytes)`);

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('import: invalid JSON');
	}
	const file = parsed as { board?: { objects?: unknown } };
	if (!file || typeof file !== 'object' || !file.board) throw new Error('import: missing board object');
	if (!Array.isArray(file.board.objects)) throw new Error('import: board.objects must be an array');
	if (file.board.objects.length > maxObjects) {
		throw new Error(`import: too many objects (${file.board.objects.length})`);
	}
	for (const obj of file.board.objects) {
		const candidate = obj as { id?: unknown; type?: unknown };
		if (
			!candidate ||
			typeof candidate !== 'object' ||
			typeof candidate.id !== 'string' ||
			typeof candidate.type !== 'string'
		) {
			throw new Error('import: object missing id/type');
		}
	}
	return deserializeBoard(json);
}

/** Insert the imported objects into the live board as one undo step. */
export async function insertImportedBoard(engine: CanvasEngine, board: Board): Promise<number> {
	const clones = remapClipboardObjects(board.objects);
	// M2-05: inline data URLs from foreign JSON go back to the asset store
	await assetifyImages(clones);
	if (clones.length === 0) return 0;
	engine.execute(new AddObjectsCommand(engine.store, clones));
	return clones.length;
}

/** Create + persist a new board from an imported file. */
export async function createBoardFromImport(board: Board): Promise<Board> {
	const created: Board = {
		...board,
		id: uuidv4(),
		createdAt: Date.now(),
		updatedAt: Date.now()
	};
	await saveBoard(created);
	return created;
}
