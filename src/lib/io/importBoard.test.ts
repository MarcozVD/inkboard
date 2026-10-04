import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_OBJECTS, validateBoardFile } from './importBoard';
import { freshBoard } from './persistence';
import { serializeBoard } from './InternalFormat';
import { createShape } from '$lib/objects/factory';
import type { ObjectType } from '$lib/objects/types';

function fileWithObjects(objects: unknown[]): string {
	return JSON.stringify({
		schemaVersion: '1.1.0',
		version: 1,
		board: { ...freshBoard('b1'), objects }
	});
}

function minimalObject(id: string, type: ObjectType = 'shape') {
	return { id, type };
}

describe('validateBoardFile (M2-07)', () => {
	it('accepts the internal board format and normalizes objects', () => {
		const json = serializeBoard({
			...freshBoard('b1'),
			objects: [createShape(1, 2, 3, 4, 'rect')]
		});
		const board = validateBoardFile(json);
		expect(board.objects).toHaveLength(1);
		expect(board.objects[0].type).toBe('shape');
		expect(board.name).toBe('Untitled');
	});

	it('rejects malformed JSON, missing board and missing objects', () => {
		expect(() => validateBoardFile('not json')).toThrow(/invalid JSON/);
		expect(() => validateBoardFile('{}')).toThrow(/missing board/);
		expect(() => validateBoardFile(JSON.stringify({ board: {} }))).toThrow(/objects/);
	});

	it('rejects objects without id/type', () => {
		expect(() => validateBoardFile(fileWithObjects([{ foo: 1 }]))).toThrow(/id\/type/);
	});

	it('enforces the byte and object limits', () => {
		expect(() => validateBoardFile(fileWithObjects([]), { maxBytes: 5 })).toThrow(/too large/);

		const tooMany = Array.from({ length: MAX_IMPORT_OBJECTS + 1 }, (_, i) => minimalObject(`o${i}`));
		expect(() => validateBoardFile(fileWithObjects(tooMany))).toThrow(/too many objects/);
		expect(() => validateBoardFile(fileWithObjects(tooMany), { maxObjects: MAX_IMPORT_OBJECTS + 1 })).not.toThrow();
	});
});
