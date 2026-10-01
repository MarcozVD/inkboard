import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { storedObjects, waitForObjectCount } from './helpers';

const STORAGE_KEY = 'inkboard:boards';
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function createBoard(page: Page): Promise<string> {
	await page.goto('/');
	await page.getByTestId('new-board').click();
	await page.waitForURL(/\/board\/[0-9a-f-]{36,}/);
	const url = page.url();
	return url.split('/board/')[1].replace(/\/$/, '').split('?')[0];
}

test.describe('home', () => {
	test('loads and shows create button', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('new-board')).toBeVisible();
	});

	test('create board navigates to the canvas', async ({ page }) => {
		const id = await createBoard(page);
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		await expect(page.locator('canvas.board-canvas')).toBeVisible();
		await expect(page.getByTestId('tool-select')).toBeVisible();
	});

	test('B14 — home hides board chrome; a board shows it', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('new-board')).toBeVisible();
		await expect(page.getByTestId('undo')).toHaveCount(0);
		await expect(page.getByTestId('redo')).toHaveCount(0);
		await expect(page.locator('.presence')).toHaveCount(0);

		await createBoard(page);
		await expect(page.getByTestId('undo')).toBeVisible();
		await expect(page.getByTestId('redo')).toBeVisible();
		await expect(page.locator('.presence')).toHaveCount(1);

		// M1-09 — the connector tool is available again
		await expect(page.getByTestId('tool-connector')).toBeVisible();
	});
});

test.describe('board canvas', () => {
	test('shape tool creates a rectangle and undo works', async ({ page }) => {
		page.on('console', (msg) => {
			if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[page] ${msg.type()}: ${msg.text()}`);
		});
		page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));
		await createBoard(page);
		// select the shape tool
		await page.getByTestId('tool-shape').click();
		await page.waitForTimeout(200);
		// select 'rect' shape
		await page.getByTitle('rect').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('canvas.board-canvas');
		const box = (await canvas.boundingBox())!;
		console.log(`[test] canvas box: ${JSON.stringify(box)}`);
		await page.mouse.move(box.x + 280, box.y + 200);
		await page.mouse.down();
		await page.mouse.move(box.x + 560, box.y + 380, { steps: 10 });
		await page.mouse.up();

		await expect(page.getByTestId('undo')).toBeEnabled({ timeout: 3000 });
		await page.getByTestId('undo').click();
		await expect(page.getByTestId('undo')).toBeDisabled();
		await expect(page.getByTestId('redo')).toBeEnabled();
		await page.getByTestId('redo').click();
		await expect(page.getByTestId('undo')).toBeEnabled();
	});

	test('autosave persists board to localStorage', async ({ page }) => {
		page.on('console', (msg) => {
			if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[page] ${msg.type()}: ${msg.text()}`);
		});
		page.on('pageerror', (err) => {
			console.log(`[pageerror] ${err.message}\n${err.stack?.split('\n').slice(0, 5).join('\n')}`);
		});
		const id = await createBoard(page);
		// draw a rectangle
		await page.getByTestId('tool-shape').click();
		await page.waitForTimeout(200);
		await page.getByTitle('rect').click();
		await page.waitForTimeout(200);
		const canvas = page.locator('canvas.board-canvas');
		const box = (await canvas.boundingBox())!;
		await page.mouse.move(box.x + 300, box.y + 160);
		await page.mouse.down();
		await page.mouse.move(box.x + 600, box.y + 320, { steps: 10 });
		await page.mouse.up();

		// wait for save indicator to show ✓
		await expect(page.getByTestId('save-indicator')).toHaveText('✓', { timeout: 7000 });

		// verify localStorage has the board
		const stored = await page.evaluate((key) => {
			const raw = localStorage.getItem(key);
			if (!raw) return null;
			const all = JSON.parse(raw);
			return Object.keys(all);
		}, STORAGE_KEY);
		expect(stored).toContain(id);

		// reload — the saved board must load from storage and re-trigger autosave
		await page.reload();
		await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });
		// board loaded + re-saved: save indicator returns to ✓
		await expect(page.getByTestId('save-indicator')).toHaveText('✓', { timeout: 7000 });
	});

	test('export menu offers png/svg/json', async ({ page }) => {
		await createBoard(page);
		await page.getByTestId('export').click();
		await expect(page.getByTestId('export-png')).toBeVisible();
		await expect(page.getByTestId('export-svg')).toBeVisible();
		await expect(page.getByTestId('export-json')).toBeVisible();
	});
});

test.describe('B13 — insert undo', () => {
	test('an inserted image can be undone and redone', async ({ page }) => {
		const id = await createBoard(page);

		const chooserPromise = page.waitForEvent('filechooser');
		await page.getByTestId('export').click();
		await page.getByTestId('import-file').click();
		const chooser = await chooserPromise;
		await chooser.setFiles({
			name: 'dot.png',
			mimeType: 'image/png',
			buffer: Buffer.from(PNG_1X1, 'base64')
		});

		await waitForObjectCount(page, id, 1);

		// move focus away from the hidden file input before using shortcuts
		await page.locator('canvas.board-canvas').click({ position: { x: 600, y: 400 } });
		await page.keyboard.press('Control+z');
		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: 8000 }).toBe(0);

		await page.keyboard.press('Control+Shift+z');
		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: 8000 }).toBe(1);
	});
});

test.describe('board list', () => {
	// helper: draw a rect so a change exists → autosave fires → ✓ appears
	async function drawAndSave(page: Page) {
		await page.getByTestId('tool-shape').click();
		await page.waitForTimeout(150);
		await page.getByTitle('rect').click();
		await page.waitForTimeout(150);
		const canvas = page.locator('canvas.board-canvas');
		const box = (await canvas.boundingBox())!;
		await page.mouse.move(box.x + 300, box.y + 160);
		await page.mouse.down();
		await page.mouse.move(box.x + 540, box.y + 320, { steps: 8 });
		await page.mouse.up();
		await expect(page.getByTestId('save-indicator')).toHaveText('✓', { timeout: 7000 });
	}

	test('created board appears in the home list', async ({ page }) => {
		const id = await createBoard(page);
		await drawAndSave(page);
		await page.goto('/');
		await expect(page.getByTestId(`board-${id}`)).toBeVisible({ timeout: 5000 });
	});

	test('opening a board from the list loads the canvas', async ({ page }) => {
		const id = await createBoard(page);
		await drawAndSave(page);
		await page.goto('/');
		await expect(page.getByTestId(`board-${id}`)).toBeVisible({ timeout: 5000 });
		await page.getByTestId(`board-${id}`).click();
		await page.waitForURL(new RegExp(`/board/${id}/?$`));
		await expect(page.locator('canvas.board-canvas')).toBeVisible();
	});
});
