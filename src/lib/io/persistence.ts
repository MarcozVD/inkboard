// Persistence service — save/load boards via Tauri IPC (Fase 11).
// Falls back to localStorage when not running inside Tauri (dev mode).
import { invoke } from '@tauri-apps/api/core';
import { serializeBoard, deserializeBoard } from './InternalFormat';
import type { Board } from '$lib/objects/types';

const STORAGE_KEY = 'inkboard:boards';

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

async function tauriListBoards(): Promise<Array<{ id: string; name: string; updated_at: number }>> {
	return await invoke('list_boards');
}

// ── localStorage fallback ──

function lsGet(id: string): string | null {
	const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
	return all[id] ?? null;
}

function lsPut(id: string, json: string): void {
	const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
	all[id] = json;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function lsList(): Array<{ id: string; name: string; updated_at: number }> {
	const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
	return Object.entries(all).map(([id, json]) => {
		try {
			const board = JSON.parse(json as string) as { board?: { name?: string; updatedAt?: number } };
			return {
				id,
				name: board.board?.name ?? 'Untitled',
				updated_at: board.board?.updatedAt ?? 0
			};
		} catch {
			return { id, name: 'Untitled', updated_at: 0 };
		}
	}).sort((a, b) => b.updated_at - a.updated_at);
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

export async function listBoards(): Promise<Array<{ id: string; name: string; updated_at: number }>> {
	if (isTauri()) {
		return await tauriListBoards();
	}
	return lsList();
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
		background: { type: 'solid', color: '#1e1f24' },
		grid: { enabled: true, size: 32, color: '#3a3d48', opacity: 0.6 },
		metadata: {}
	};
}