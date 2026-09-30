import { expect, type Page } from '@playwright/test';

export const STORAGE_KEY = 'inkboard:boards';

export interface StoredTransform {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
}

export interface StoredObject {
	id: string;
	type: string;
	content?: string;
	shape?: string;
	points?: number[];
	transform: StoredTransform;
}

export interface StoredBoard {
	id: string;
	name: string;
	objects: StoredObject[];
	camera: { x: number; y: number; zoom: number };
	createdAt?: number;
	updatedAt?: number;
}

export interface Point {
	x: number;
	y: number;
}

/** Create a board from Home and return its id. */
export async function createBoard(page: Page): Promise<string> {
	await page.goto('/');
	await page.getByTestId('new-board').click();
	await page.waitForURL(/\/board\/[0-9a-f-]{36,}/);
	await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });
	return page.url().split('/board/')[1].replace(/\/$/, '').split('?')[0];
}

export async function openBoard(page: Page, id: string): Promise<void> {
	await page.goto(`/board/${id}/`);
	await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });
}

/**
 * Read the board stored under `inkboard:boards[boardId]`.
 * The stored value is the serialized BoardFile: `{ schemaVersion, version, board }`.
 */
export async function readStoredBoard(page: Page, id: string): Promise<StoredBoard | null> {
	return page.evaluate(
		([key, boardId]) => {
			const raw = localStorage.getItem(key);
			if (!raw) return null;
			const all = JSON.parse(raw) as Record<string, string>;
			const json = all[boardId];
			if (!json) return null;
			try {
				const file = JSON.parse(json) as { board?: StoredBoard };
				return file.board ?? null;
			} catch {
				return null;
			}
		},
		[STORAGE_KEY, id] as const
	);
}

export async function storedObjects(page: Page, id: string): Promise<StoredObject[]> {
	const board = await readStoredBoard(page, id);
	return board?.objects ?? [];
}

/** Wait until the stored board holds exactly `count` objects (autosave debounce is 2 s). */
export async function waitForObjectCount(
	page: Page,
	id: string,
	count: number,
	timeout = 8000
): Promise<StoredObject[]> {
	await expect.poll(async () => (await storedObjects(page, id)).length, { timeout }).toBe(count);
	return storedObjects(page, id);
}

export async function canvasBox(page: Page) {
	const box = await page.locator('canvas.board-canvas').boundingBox();
	if (!box) throw new Error('canvas.board-canvas is not visible');
	return box;
}

export async function selectTool(page: Page, tool: string): Promise<void> {
	await page.getByTestId(`tool-${tool}`).click();
	await page.waitForTimeout(100);
}

/** Draw a shape with the shape tool. `from`/`to` are canvas-local coordinates. */
export async function drawShape(
	page: Page,
	shape: string,
	from: Point,
	to: Point,
	options: { shift?: boolean } = {}
): Promise<void> {
	const box = await canvasBox(page);
	await selectTool(page, 'shape');
	await page.getByTitle(shape).click();
	await page.waitForTimeout(100);
	await page.mouse.move(box.x + from.x, box.y + from.y);
	await page.mouse.down();
	if (options.shift) await page.keyboard.down('Shift');
	await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
	if (options.shift) await page.keyboard.up('Shift');
	await page.mouse.up();
	await page.waitForTimeout(100);
}

/** Real-mouse drag. `from`/`to` are canvas-local coordinates. */
export async function dragMouse(page: Page, from: Point, to: Point, steps = 8): Promise<void> {
	const box = await canvasBox(page);
	await page.mouse.move(box.x + from.x, box.y + from.y);
	await page.mouse.down();
	await page.mouse.move(box.x + to.x, box.y + to.y, { steps });
	await page.mouse.up();
	await page.waitForTimeout(100);
}
