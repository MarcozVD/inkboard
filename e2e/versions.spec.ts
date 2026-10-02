import { test, expect } from '@playwright/test';
import { createBoard, drawShape, storedObjects, waitForObjectCount } from './helpers';

const TIMEOUT = 8000;

test.describe('M2-04 — version history', () => {
	test('save a version and restore it (never destructive)', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 400, y: 300 });
		await waitForObjectCount(page, id, 1);

		// manual snapshot
		await page.getByLabel('Settings').click();
		await page.getByTestId('save-version').click();
		await expect(page.getByTestId('restore-version-0')).toBeVisible();
		await page.getByLabel('Close settings').click();

		// add a second object after the snapshot
		await drawShape(page, 'rect', { x: 500, y: 200 }, { x: 600, y: 300 });
		await waitForObjectCount(page, id, 2);

		// restore the snapshot (reloads the board)
		await page.getByLabel('Settings').click();
		await page.getByTestId('restore-version-0').click();
		await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });
		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT }).toBe(1);

		// the restore kept a "Before restore" snapshot
		await page.getByLabel('Settings').click();
		await expect(page.getByTestId('version-list')).toContainText('Before restore');
	});
});
