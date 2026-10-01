import { test, expect } from '@playwright/test';
import { canvasBox, createBoard, drawShape, selectTool, storedObjects, waitForObjectCount } from './helpers';

const TIMEOUT = 8000;

function shapeXs(objects: Awaited<ReturnType<typeof storedObjects>>): string {
	return objects
		.filter((o) => o.type === 'shape')
		.map((o) => Math.round(o.transform.x))
		.join(',');
}

test.describe('M1-11 — context menu', () => {
	test('menu shows shortcuts and actions are undoable; export selection downloads', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 400, y: 300 });
		await drawShape(page, 'rect', { x: 460, y: 200 }, { x: 560, y: 300 });
		await waitForObjectCount(page, id, 2);

		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 350, box.y + 250, { button: 'right' });

		// hints come from the shared shortcut table
		const copy = page.getByRole('menuitem', { name: /Copy/ });
		await expect(copy).toBeVisible();
		await expect(copy.locator('.cm-hint')).toHaveText('Ctrl+C');
		await expect(page.getByRole('menuitem', { name: /Bring to front/ }).locator('.cm-hint')).toHaveText('Ctrl+]');

		// duplicate through the menu, undo it
		await page.getByRole('menuitem', { name: /^Duplicate/ }).click();
		await waitForObjectCount(page, id, 3);
		await page.keyboard.press('Control+z');
		await waitForObjectCount(page, id, 2);

		// order: bring the first rect to the front, undo restores paint order
		await page.mouse.click(box.x + 350, box.y + 250, { button: 'right' });
		await page.getByRole('menuitem', { name: /Bring to front/ }).click();
		await expect.poll(async () => shapeXs(await storedObjects(page, id)), { timeout: TIMEOUT }).toBe('460,300');
		await page.keyboard.press('Control+z');
		await expect.poll(async () => shapeXs(await storedObjects(page, id)), { timeout: TIMEOUT }).toBe('300,460');

		// export selection downloads a PNG
		await page.mouse.click(box.x + 350, box.y + 250, { button: 'right' });
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('menuitem', { name: /Export selection/ }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/selection.*\.png$/);
	});
});

test.describe('M1-12 — shortcut overlay', () => {
	test('? opens the overlay from the shared table and Esc closes it', async ({ page }) => {
		await createBoard(page);
		await page.keyboard.press('?');

		const overlay = page.getByTestId('shortcuts-overlay');
		await expect(overlay).toBeVisible();
		await expect(overlay).toContainText('Group');
		await expect(overlay).toContainText('Ctrl+G');
		await expect(overlay).toContainText('Connector');

		await page.keyboard.press('Escape');
		await expect(overlay).toHaveCount(0);
	});
});
