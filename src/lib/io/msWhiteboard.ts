// msWhiteboard — MS Whiteboard text import (M2-11, §17).
// Extracted texts become stickies in a centered grid, as one undo step.
import { AddObjectsCommand } from '$lib/canvas/commands';
import { createStickyNote } from '$lib/objects/factory';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';

export const STICKY_GRID = { width: 220, height: 200, gap: 16 } as const;
export const MAX_GRID_COLUMNS = 4;

export interface GridPosition {
	x: number;
	y: number;
}

/** Grid slots centered on `center`; up to `MAX_GRID_COLUMNS` columns. */
export function stickyGridPositions(count: number, center: GridPosition = { x: 0, y: 0 }): GridPosition[] {
	if (count <= 0) return [];
	const { width, height, gap } = STICKY_GRID;
	const cols = Math.max(1, Math.min(MAX_GRID_COLUMNS, Math.ceil(Math.sqrt(count))));
	const rows = Math.ceil(count / cols);
	const totalWidth = cols * width + (cols - 1) * gap;
	const totalHeight = rows * height + (rows - 1) * gap;
	const startX = center.x - totalWidth / 2;
	const startY = center.y - totalHeight / 2;
	return Array.from({ length: count }, (_, i) => ({
		x: startX + (i % cols) * (width + gap),
		y: startY + Math.floor(i / cols) * (height + gap)
	}));
}

/**
 * Insert the texts extracted from a MS Whiteboard ZIP as stickies in a grid
 * centered on `center` (world coords). One `AddObjectsCommand` → one undo.
 * Returns how many stickies were inserted.
 */
export function insertImportedStickies(
	engine: CanvasEngine,
	title: string | null | undefined,
	texts: string[],
	center: GridPosition = { x: 0, y: 0 }
): number {
	const lines = [...(title ? [title] : []), ...texts].map((line) => line.trim()).filter(Boolean);
	if (lines.length === 0) return 0;
	const positions = stickyGridPositions(lines.length, center);
	const objects = lines.map((line, i) => createStickyNote(positions[i].x, positions[i].y, line));
	engine.execute(new AddObjectsCommand(engine.store, objects));
	return objects.length;
}
