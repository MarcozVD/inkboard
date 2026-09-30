import { test, expect } from '@playwright/test';
import { createBoard, drawShape, storedObjects } from './helpers';

const TIMEOUT = 5000;

test.describe('B05 — changes must survive leaving the board', () => {
	test('navigating Home right after an edit flushes the pending save', async ({ page }) => {
		const id = await createBoard(page);
		// draw, then leave well before the 2 s autosave debounce fires
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 350 });
		await page.goto('/');
		await expect(page.getByTestId('new-board')).toBeVisible();

		await expect
			.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT })
			.toBe(1);
	});

	test('reloading right after an edit keeps the change', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 350 });
		await page.reload();
		await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });

		await expect
			.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT })
			.toBe(1);
	});
});
