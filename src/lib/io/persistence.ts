// Persistence service — save/load boards via Tauri IPC (Fase 11).
// Falls back to localStorage when not running inside Tauri (dev mode).
// M2-02 adds board management (rename/duplicate/soft delete/restore/purge)
// with an equivalent localStorage implementation for the browser.
import { invoke } from '@tauri-apps/api/core';
import { serializeBoard, deserializeBoard } from './InternalFormat';
import type { Board, BoardMeta } from '$lib/objects/types';

const STORAGE_KEY = 'inkboard:boards';
const TRASH_KEY = 'inkboard:trash';
const FAV_KEY = 'inkboard:favorites';

function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ── Tauri IPC calls ──

async function tauriSaveBoard(boardId: string, name: string, json: string): Promise<void> {
	await invoke('save_board', { boardId, name, json });
}

async function tauriLoadBoard(boardId: string): Promise<string> {
	const result = await invoke<{ json: string }>('load_board', { boardId });
	return result.json;
}

interface RustBoardMeta {
	id: string;
	name: string;
	created_at: number;
	updated_at: number;
	object_count: number;
	is_favorite: boolean;
	deleted_at: number | null;
}

async function tauriListBoards(trash: boolean, sort: string): Promise<BoardMeta[]> {
	const rows = await invoke<RustBoardMeta[]>('list_boards', { trash, sort });
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		objectCount: row.object_count,
		isFavorite: row.is_favorite,
		deletedAt: row.deleted_at
	}));
}

// ── localStorage fallback ──

type LsMap = Record<string, string>;

function readMap(key: string): LsMap {
	try {
		return JSON.parse(localStorage.getItem(key) || '{}') as LsMap;
	} catch {
		return {};
	}
}

function writeMap(key: string, map: LsMap): void {
	localStorage.setItem(key, JSON.stringify(map));
}

function lsGet(id: string): string | null {
	return readMap(STORAGE_KEY)[id] ?? null;
}

function lsPut(id: string, json: string): void {
	const all = readMap(STORAGE_KEY);
	all[id] = json;
	writeMap(STORAGE_KEY, all);
}

function readFavorites(): Set<string> {
	try {
		return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'));
	} catch {
		return new Set();
	}
}

function writeFavorites(favorites: Set<string>): void {
	localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
}

function metaFromJson(id: string, json: string, favorite: boolean, deletedAt: number | null): BoardMeta {
	try {
		const board = (JSON.parse(json) as { board?: Board }).board;
		return {
			id,
			name: board?.name ?? 'Untitled',
			createdAt: board?.createdAt ?? 0,
			updatedAt: board?.updatedAt ?? 0,
			objectCount: board?.objects?.length ?? 0,
			isFavorite: favorite,
			deletedAt
		};
	} catch {
		return { id, name: 'Untitled', createdAt: 0, updatedAt: 0, objectCount: 0, isFavorite: favorite, deletedAt };
	}
}

function lsList(trash: boolean, sort: string): BoardMeta[] {
	const favorites = readFavorites();
	const map = trash ? readMap(TRASH_KEY) : readMap(STORAGE_KEY);
	const metas = Object.entries(map).map(([id, json]) => metaFromJson(id, json, favorites.has(id), trash ? 1 : null));
	metas.sort((a, b) =>
		sort === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : b.updatedAt - a.updatedAt
	);
	return metas;
}

function updateLsBoard(id: string, mutate: (board: Board) => void): void {
	const json = lsGet(id);
	if (!json) throw new Error(`board not found: ${id}`);
	const file = JSON.parse(json) as { board: Board };
	mutate(file.board);
	lsPut(id, JSON.stringify(file));
}

// ── Public API ──

export async function saveBoard(board: Board): Promise<void> {
	const json = serializeBoard(board);
	const name = board.name || 'Untitled';
	if (isTauri()) {
		await tauriSaveBoard(board.id, name, json);
	} else {
		lsPut(board.id, json);
	}
}

export async function loadBoard(boardId: string, defaultName = 'Untitled'): Promise<Board> {
	if (isTauri()) {
		const json = await tauriLoadBoard(boardId);
		return deserializeBoard(json);
	}
	const json = lsGet(boardId);
	if (json) return deserializeBoard(json);
	// new board: return a fresh Board with the given id
	return freshBoard(boardId, defaultName);
}

export interface ListBoardsOptions {
	trash?: boolean;
	sort?: 'date' | 'name';
}

export async function listBoards(opts: ListBoardsOptions = {}): Promise<BoardMeta[]> {
	const trash = opts.trash ?? false;
	const sort = opts.sort ?? 'date';
	if (isTauri()) return tauriListBoards(trash, sort);
	return lsList(trash, sort);
}

export async function renameBoard(id: string, name: string): Promise<void> {
	if (isTauri()) {
		await invoke('rename_board', { boardId: id, name });
		return;
	}
	updateLsBoard(id, (board) => {
		board.name = name;
		board.updatedAt = Date.now();
	});
}

export async function duplicateBoard(id: string, newId: string, name: string): Promise<void> {
	if (isTauri()) {
		await invoke('duplicate_board', { boardId: id, newId, name });
		return;
	}
	const json = lsGet(id);
	if (!json) throw new Error(`board not found: ${id}`);
	const file = JSON.parse(json) as { board: Board };
	file.board.id = newId;
	file.board.name = name;
	file.board.createdAt = Date.now();
	file.board.updatedAt = Date.now();
	lsPut(newId, JSON.stringify(file));
}

export async function deleteBoard(id: string): Promise<void> {
	if (isTauri()) {
		await invoke('delete_board', { boardId: id });
		return;
	}
	const json = lsGet(id);
	if (!json) throw new Error(`board not found: ${id}`);
	const boards = readMap(STORAGE_KEY);
	delete boards[id];
	writeMap(STORAGE_KEY, boards);
	const trash = readMap(TRASH_KEY);
	trash[id] = json;
	writeMap(TRASH_KEY, trash);
}

export async function restoreBoard(id: string): Promise<void> {
	if (isTauri()) {
		await invoke('restore_board', { boardId: id });
		return;
	}
	const trash = readMap(TRASH_KEY);
	const json = trash[id];
	if (!json) throw new Error(`board not in trash: ${id}`);
	delete trash[id];
	writeMap(TRASH_KEY, trash);
	lsPut(id, json);
}

export async function purgeBoard(id: string): Promise<void> {
	if (isTauri()) {
		await invoke('purge_board', { boardId: id });
	} else {
		const trash = readMap(TRASH_KEY);
		delete trash[id];
		writeMap(TRASH_KEY, trash);
	}
	const favorites = readFavorites();
	if (favorites.delete(id)) writeFavorites(favorites);
}

export async function setBoardFavorite(id: string, favorite: boolean): Promise<void> {
	if (isTauri()) {
		await invoke('set_favorite', { boardId: id, favorite });
		return;
	}
	const favorites = readFavorites();
	if (favorite) favorites.add(id);
	else favorites.delete(id);
	writeFavorites(favorites);
}

/**
 * One-time migration of the legacy localStorage favorites into SQLite (M2-02).
 * No-op outside Tauri or when there is nothing to migrate.
 */
export async function migrateLegacyFavorites(): Promise<number> {
	if (!isTauri()) return 0;
	const raw = localStorage.getItem(FAV_KEY);
	if (!raw) return 0;
	let ids: string[];
	try {
		ids = JSON.parse(raw) as string[];
	} catch {
		ids = [];
	}
	const active = await tauriListBoards(false, 'date');
	const known = new Set(active.map((meta) => meta.id));
	let migrated = 0;
	for (const id of ids) {
		if (!known.has(id)) continue;
		await invoke('set_favorite', { boardId: id, favorite: true });
		migrated++;
	}
	localStorage.removeItem(FAV_KEY);
	return migrated;
}

export function freshBoard(id: string, name = 'Untitled'): Board {
	return {
		id,
		workspaceId: 'default',
		name,
		version: 1,
		schemaVersion: '1.0.0',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		camera: { x: 0, y: 0, zoom: 1, minZoom: 0.05, maxZoom: 32 },
		objects: [],
		background: { type: 'solid', color: '#0f1013' },
		grid: { enabled: true, size: 32, color: 'grid', opacity: 0.6, snap: false },
		metadata: {}
	};
}
