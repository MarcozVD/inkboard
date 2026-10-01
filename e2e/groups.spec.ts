import { test, expect } from '@playwright/test';
import { canvasBox, createBoard, drawShape, dragMouse, selectTool, storedObjects, waitForObjectCount } from './helpers';

const TIMEOUT = 8000;

function shapeXs(objects: Awaited<ReturnType<typeof storedObjects>>): number[] {
	return objects.filter((o) => o.type === 'shape').map((o) => Math.round(o.transform.x));
}

test.describe('M1-05 — groups', () => {
	test('Ctrl+G groups; moving one member moves the group; undo restores', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 400, y: 300 });
		await drawShape(page, 'rect', { x: 460, y: 200 }, { x: 560, y: 300 });
		await waitForObjectCount(page, id, 2);

		await selectTool(page, 'select');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+g');

		// clicking one member selects (and moves) the whole group
		await dragMouse(page, { x: 350, y: 250 }, { x: 450, y: 330 });
		await expect.poll(async () => shapeXs(await storedObjects(page, id)), { timeout: TIMEOUT }).toEqual([400, 560]);

		await page.keyboard.press('Control+z');
		await expect.poll(async () => shapeXs(await storedObjects(page, id)), { timeout: TIMEOUT }).toEqual([300, 460]);
	});

	test('double click enters the group and selects the child', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 400, y: 300 });
		await drawShape(page, 'rect', { x: 460, y: 200 }, { x: 560, y: 300 });
		await waitForObjectCount(page, id, 2);

		await selectTool(page, 'select');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+g');

		const box = await canvasBox(page);
		await page.mouse.dblclick(box.x + 350, box.y + 250);
		await dragMouse(page, { x: 350, y: 250 }, { x: 400, y: 300 });
		await expect.poll(async () => shapeXs(await storedObjects(page, id)), { timeout: TIMEOUT }).toEqual([350, 460]);
	});
});
