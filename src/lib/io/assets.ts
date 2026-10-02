// assets — content-addressed image storage (M2-05, D3).
// Tauri: `assets` table via put_asset/get_asset (raw bytes over IPC).
// Browser: IndexedDB. `ImageObject.src` becomes `asset:<sha256 hex>`.
import { invoke } from '@tauri-apps/api/core';
import { SCHEMA_VERSION } from '$lib/io/InternalFormat';
import type { Board, CanvasObject } from '$lib/objects/types';

export const ASSET_PREFIX = 'asset:';
const IDB_NAME = 'inkboard-assets';
const IDB_STORE = 'assets';
const IDB_VERSION = 1;
const HASH_RE = /^[0-9a-f]{64}$/;

function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isAssetSrc(src: string): boolean {
	return src.startsWith(ASSET_PREFIX);
}

export function assetHash(src: string): string | null {
	if (!isAssetSrc(src)) return null;
	const hash = src.slice(ASSET_PREFIX.length);
	return HASH_RE.test(hash) ? hash : null;
}

// ── data URLs ──

export interface ParsedDataUrl {
	bytes: Uint8Array;
	mime: string;
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
	const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
	if (!match) return null;
	const mime = match[1] || 'application/octet-stream';
	try {
		if (match[2]) {
			const binary = atob(match[3]);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			return { bytes, mime };
		}
		return { bytes: new TextEncoder().encode(decodeURIComponent(match[3])), mime };
	} catch {
		return null;
	}
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const copy = new Uint8Array(bytes);
	const digest = await crypto.subtle.digest('SHA-256', copy);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
	return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** Mime sniffing for `get_asset`, which returns raw bytes without metadata. */
export function mimeFromBytes(bytes: Uint8Array): string {
	if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		return 'image/png';
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'GIF8') return 'image/gif';
	if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
	const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart().toLowerCase();
	if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml';
	return 'application/octet-stream';
}

// ── IndexedDB (browser fallback, D3) ──

interface AssetRow {
	hash: string;
	mime: string;
	blob: Blob;
	width: number;
	height: number;
	createdAt: number;
}

function idbOpen(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(IDB_NAME, IDB_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(IDB_STORE)) {
				request.result.createObjectStore(IDB_STORE, { keyPath: 'hash' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function idbResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function idbPut(row: AssetRow): Promise<void> {
	const db = await idbOpen();
	try {
		await idbResult(db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(row));
	} finally {
		db.close();
	}
}

async function idbGet(hash: string): Promise<AssetRow | null> {
	const db = await idbOpen();
	try {
		const row = await idbResult<AssetRow | undefined>(
			db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(hash)
		);
		return row ?? null;
	} finally {
		db.close();
	}
}

// ── cache (blob object URLs + lazy data URLs) ──

const urlCache = new Map<string, string>();
const dataUrlCache = new Map<string, string>();
const pendingLoads = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** Repaint hook: called when a background asset load finishes. */
export function onAssetResolved(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function notifyAssetResolved(): void {
	for (const listener of listeners) listener();
}

/** Sync cache lookup for the renderer; undefined while still loading. */
export function cachedAssetUrl(src: string): string | undefined {
	const hash = assetHash(src);
	return hash ? urlCache.get(hash) : undefined;
}

function cacheAsset(hash: string, blob: Blob): void {
	if (urlCache.has(hash)) return;
	const url = URL.createObjectURL(blob);
	urlCache.set(hash, url);
}

// ── store ──

type PutAsset = (bytes: Uint8Array, mime: string, width: number, height: number) => Promise<string>;

export async function putAsset(bytes: Uint8Array, mime: string, width: number, height: number): Promise<string> {
	const hash = isTauri()
		? await putAssetTauri(bytes, mime, width, height)
		: await putAssetIndexedDb(bytes, mime, width, height);
	cacheAsset(hash, new Blob([bytes.slice()], { type: mime }));
	return hash;
}

async function putAssetTauri(bytes: Uint8Array, mime: string, width: number, height: number): Promise<string> {
	return invoke<string>('put_asset', bytes, {
		headers: { 'x-mime': mime, 'x-width': String(width), 'x-height': String(height) }
	});
}

async function putAssetIndexedDb(bytes: Uint8Array, mime: string, width: number, height: number): Promise<string> {
	if (typeof indexedDB === 'undefined') throw new Error('asset store unavailable (no IndexedDB)');
	const hash = await sha256Hex(bytes);
	const blob = new Blob([bytes.slice()], { type: mime });
	await idbPut({ hash, mime, blob, width, height, createdAt: Date.now() });
	return hash;
}

async function loadAsset(hash: string): Promise<{ blob: Blob; mime: string } | null> {
	if (isTauri()) {
		const bytes = new Uint8Array(await invoke<ArrayBuffer>('get_asset', { hash }));
		const mime = mimeFromBytes(bytes);
		return { blob: new Blob([bytes], { type: mime }), mime };
	}
	const row = await idbGet(hash);
	return row ? { blob: row.blob, mime: row.mime } : null;
}

/** Resolve an `asset:` source to a cached object URL (async, deduplicated). */
export async function resolveAssetUrl(src: string): Promise<string | null> {
	const hash = assetHash(src);
	if (!hash) return isAssetSrc(src) ? null : src;
	const cached = urlCache.get(hash);
	if (cached) return cached;
	let task = pendingLoads.get(hash);
	if (!task) {
		task = (async () => {
			try {
				const loaded = await loadAsset(hash);
				if (loaded) {
					cacheAsset(hash, loaded.blob);
					notifyAssetResolved();
				}
			} catch (err) {
				console.error('asset load failed', hash, err);
			} finally {
				pendingLoads.delete(hash);
			}
		})();
		pendingLoads.set(hash, task);
	}
	await task;
	return urlCache.get(hash) ?? null;
}

/** Resolve an `asset:` source to a portable data URL (export/clipboard). */
export async function resolveAssetDataUrl(src: string): Promise<string> {
	if (!isAssetSrc(src)) return src;
	const hash = assetHash(src);
	if (!hash) return src;
	const cached = dataUrlCache.get(hash);
	if (cached) return cached;
	const url = urlCache.get(hash) ?? (await resolveAssetUrl(src));
	if (!url) return src;
	try {
		const blob = await (await fetch(url)).blob();
		const dataUrl = await blobToDataUrl(blob);
		dataUrlCache.set(hash, dataUrl);
		return dataUrl;
	} catch (err) {
		console.error('asset data URL failed', hash, err);
		return src;
	}
}

/** Clone objects with every `asset:` source inlined as a data URL. */
export async function resolveAssetSources(objects: CanvasObject[]): Promise<CanvasObject[]> {
	const clones = structuredClone(objects);
	await Promise.all(
		clones.map(async (obj) => {
			if (obj.type === 'image' && isAssetSrc(obj.src)) obj.src = await resolveAssetDataUrl(obj.src);
		})
	);
	return clones;
}

// ── migration / insert helpers ──

async function assetifyWith(objects: CanvasObject[], put: PutAsset): Promise<number> {
	const pending = new Map<string, Promise<string>>();
	let changed = 0;
	for (const obj of objects) {
		if (obj.type !== 'image' || !obj.src.startsWith('data:')) continue;
		try {
			let task = pending.get(obj.src);
			if (!task) {
				const parsed = parseDataUrl(obj.src);
				if (!parsed) continue;
				task = put(parsed.bytes, parsed.mime, obj.originalWidth ?? 0, obj.originalHeight ?? 0);
				pending.set(obj.src, task);
			}
			obj.src = `${ASSET_PREFIX}${await task}`;
			changed++;
		} catch (err) {
			console.error('assetify failed', err);
		}
	}
	return changed;
}

/** Move inline data URLs into the asset store (paste / image insert). */
export function assetifyImages(objects: CanvasObject[]): Promise<number> {
	return assetifyWith(objects, putAsset);
}

export interface AssetMigrationDeps {
	putAsset?: PutAsset;
	/** runs once before the first rewrite (board_versions snapshot) */
	snapshot?: () => Promise<void>;
}

/**
 * Schema 1.1.0 migration: inline data URLs → content-addressed asset refs.
 * Idempotent: a board without data URLs is returned untouched.
 */
export async function migrateBoardAssets(board: Board, deps: AssetMigrationDeps = {}): Promise<number> {
	if (!board.objects.some((obj) => obj.type === 'image' && obj.src.startsWith('data:'))) return 0;
	if (deps.snapshot) {
		try {
			await deps.snapshot();
		} catch (err) {
			console.error('asset migration snapshot failed', err);
		}
	}
	const migrated = await assetifyWith(board.objects, deps.putAsset ?? putAsset);
	if (migrated > 0) board.schemaVersion = SCHEMA_VERSION;
	return migrated;
}
