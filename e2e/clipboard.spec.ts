import { test, expect } from '@playwright/test';
import { canvasBox, createBoard, drawShape, selectTool, storedObjects, waitForObjectCount } from './helpers';

const TIMEOUT = 8000;

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.describe('M1-04 — clipboard', () => {
	test('copy in board A, paste in board B', async ({ page }) => {
		const a = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 350 });
		await waitForObjectCount(page, a, 1);

		const boxA = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(boxA.x + 400, boxA.y + 275);
		await page.keyboard.press('Control+c');

		const b = await createBoard(page);
		const boxB = await canvasBox(page);
		await page.mouse.move(boxB.x + 400, boxB.y + 300);
		await page.keyboard.press('Control+v');
		await waitForObjectCount(page, b, 1);

		const pasted = (await storedObjects(page, b))[0];
		expect(pasted.type).toBe('shape');
		expect(pasted.shape).toBe('rect');
	});

	test('cut removes the selection and undo restores it', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 350 });
		await waitForObjectCount(page, id, 1);

		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 400, box.y + 275);
		await page.keyboard.press('Control+x');
		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT }).toBe(0);

		await page.keyboard.press('Control+z');
		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT }).toBe(1);
	});

	test('plain text pastes as a text object', async ({ page }) => {
		const id = await createBoard(page);
		await page.evaluate(() => navigator.clipboard.writeText('hola mundo'));

		const box = await canvasBox(page);
		await page.mouse.move(box.x + 400, box.y + 300);
		await page.keyboard.press('Control+v');

		await expect
			.poll(async () => (await storedObjects(page, id)).find((o) => o.type === 'text')?.content ?? null, {
				timeout: TIMEOUT
			})
			.toBe('hola mundo');
	});
});
