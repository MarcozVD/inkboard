import { test, expect } from '@playwright/test';
import { canvasBox, createBoard, dragMouse, drawShape, selectTool, storedObjects, waitForObjectCount } from './helpers';

const TIMEOUT = 8000;

function shapes(objects: Awaited<ReturnType<typeof storedObjects>>) {
	return objects.filter((o) => o.type === 'shape');
}

test.describe('M1-06 — lock', () => {
	test('locked objects are not marquee-selected, moved or erased', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 400, y: 300 });
		await drawShape(page, 'rect', { x: 460, y: 200 }, { x: 560, y: 300 });
		await waitForObjectCount(page, id, 2);

		// lock the first rect
		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 350, box.y + 250);
		await page.keyboard.press('Control+Shift+l');
		await page.keyboard.press('Escape');

		// marquee over both: only the unlocked one is selected
		await dragMouse(page, { x: 260, y: 160 }, { x: 620, y: 360 });
		await page.keyboard.press('Delete');
		await expect.poll(async () => shapes(await storedObjects(page, id)).length, { timeout: TIMEOUT }).toBe(1);
		const remaining = shapes(await storedObjects(page, id))[0];
		expect(Math.round(remaining.transform.x)).toBe(300);
		expect(remaining.style).toBeTruthy();

		// the eraser ignores the locked object
		await selectTool(page, 'eraser');
		await dragMouse(page, { x: 340, y: 240 }, { x: 370, y: 270 }, 3);
		await page.waitForTimeout(2500);
		expect(shapes(await storedObjects(page, id)).length).toBe(1);

		// a locked selection cannot be moved...
		await selectTool(page, 'select');
		await dragMouse(page, { x: 350, y: 250 }, { x: 470, y: 350 });
		await page.waitForTimeout(500);
		expect(Math.round(shapes(await storedObjects(page, id))[0].transform.x)).toBe(300);

		// ...and unlock + move works
		await page.keyboard.press('Control+Shift+l');
		await dragMouse(page, { x: 350, y: 250 }, { x: 450, y: 350 });
		await expect
			.poll(async () => Math.round(shapes(await storedObjects(page, id))[0].transform.x), {
				timeout: TIMEOUT
			})
			.toBe(400);
	});

	test('the context menu toggles lock', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 400, y: 300 });
		await waitForObjectCount(page, id, 1);

		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 350, box.y + 250, { button: 'right' });
		await page.getByRole('menuitem', { name: /^Lock/ }).click();

		await expect.poll(async () => (await storedObjects(page, id))[0]?.locked ?? null, { timeout: TIMEOUT }).toBe(true);
	});
});
