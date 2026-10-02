import { describe, expect, it, vi } from 'vitest';
import { ASSET_PREFIX, migrateBoardAssets, mimeFromBytes, parseDataUrl, sha256Hex } from './assets';
import { SCHEMA_VERSION, serializeBoard } from './InternalFormat';
import { freshBoard } from './persistence';
import { createImage } from '$lib/objects/factory';

const PNG_DATA_URL = `data:image/png;base64,${btoa('fake-png-bytes')}`;

describe('sha256Hex', () => {
	it('matches the known SHA-256 vector for "abc"', async () => {
		expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});
});

describe('parseDataUrl', () => {
	it('decodes base64 payloads and keeps the mime', () => {
		const parsed = parseDataUrl(`data:image/png;base64,${btoa('abc')}`);
		expect(parsed?.mime).toBe('image/png');
		expect(Array.from(parsed?.bytes ?? [])).toEqual([97, 98, 99]);
	});

	it('decodes url-encoded payloads and rejects malformed input', () => {
		const parsed = parseDataUrl('data:image/svg+xml,%3Csvg%20%2F%3E');
		expect(Array.from(parsed?.bytes ?? [])).toEqual(Array.from(new TextEncoder().encode('<svg />')));
		expect(parseDataUrl('not a data url')).toBeNull();
	});
});

describe('mimeFromBytes', () => {
	it('sniffs png/jpeg/svg and falls back to octet-stream', () => {
		expect(mimeFromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe('image/png');
		expect(mimeFromBytes(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
		expect(mimeFromBytes(new TextEncoder().encode('  <svg xmlns="…">'))).toBe('image/svg+xml');
		expect(mimeFromBytes(new Uint8Array([1, 2, 3]))).toBe('application/octet-stream');
	});
});

describe('migrateBoardAssets', () => {
	it('moves data URLs to the asset store, dedupes by source and is idempotent', async () => {
		const board = freshBoard('b1');
		board.objects = [
			createImage(0, 0, PNG_DATA_URL, 100, 50),
			createImage(10, 10, PNG_DATA_URL, 100, 50),
			createImage(20, 20, `data:image/png;base64,${btoa('other')}`, 10, 10)
		];
		const putAsset = vi.fn(async () => 'a'.repeat(64));
		const snapshot = vi.fn(async () => {});

		const first = await migrateBoardAssets(board, { putAsset, snapshot });
		expect(first).toBe(3);
		expect(board.schemaVersion).toBe(SCHEMA_VERSION);
		expect(board.objects.every((obj) => obj.type === 'image' && obj.src.startsWith(ASSET_PREFIX))).toBe(true);
		expect(putAsset).toHaveBeenCalledTimes(2);
		expect(snapshot).toHaveBeenCalledTimes(1);

		const second = await migrateBoardAssets(board, { putAsset, snapshot });
		expect(second).toBe(0);
		expect(putAsset).toHaveBeenCalledTimes(2);
		expect(snapshot).toHaveBeenCalledTimes(1);
	});

	it('keeps a large image out of the autosave payload (under 100 KB)', async () => {
		const bigDataUrl = `data:image/png;base64,${'A'.repeat(1_400_000)}`;
		const board = freshBoard('b1');
		board.objects = [createImage(0, 0, bigDataUrl, 2000, 2000)];
		expect(serializeBoard(board).length).toBeGreaterThan(100_000);

		await migrateBoardAssets(board, { putAsset: async () => 'b'.repeat(64), snapshot: async () => {} });
		const payload = serializeBoard(board);
		expect(payload.length).toBeLessThan(100_000);
		expect((board.objects[0] as { src: string }).src).toBe(`${ASSET_PREFIX}${'b'.repeat(64)}`);
	});
});
