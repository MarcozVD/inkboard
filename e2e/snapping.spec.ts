import { test, expect } from '@playwright/test';
import {
	canvasBox,
	createBoard,
	drawShape,
	dragMouse,
	readStoredBoard,
	selectTool,
	storedObjects,
	waitForObjectCount
} from './helpers';

const TIMEOUT = 8000;

function shapeX(objects: Awaited<ReturnType<typeof storedObjects>>): number | null {
	const shape = objects.find((o) => o.type === 'shape');
	return shape ? Math.round(shape.transform.x) : null;
}

test.describe('M1-07 — snapping and nudge', () => {
	test('arrow keys nudge by 1 px (10 with Shift) and undo', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 400, y: 300 });
		await waitForObjectCount(page, id, 1);

		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 350, box.y + 250);

		await page.keyboard.press('ArrowRight');
		await expect.poll(async () => shapeX(await storedObjects(page, id)), { timeout: TIMEOUT }).toBe(301);

		await page.keyboard.press('Shift+ArrowRight');
		await expect.poll(async () => shapeX(await storedObjects(page, id)), { timeout: TIMEOUT }).toBe(311);

		await page.keyboard.press('Control+z');
		await expect.poll(async () => shapeX(await storedObjects(page, id)), { timeout: TIMEOUT }).toBe(301);

		await page.keyboard.press('Control+z');
		await expect.poll(async () => shapeX(await storedObjects(page, id)), { timeout: TIMEOUT }).toBe(300);
	});

	test('snap to grid aligns the moved object and persists in the board', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 317, y: 192 }, { x: 417, y: 292 });
		await waitForObjectCount(page, id, 1);

		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 367, box.y + 242);

		// enable snap in Settings
		await page.getByLabel('Settings').click();
		await page.locator('label.sp-toggle:has(#sp-snap-toggle)').click();
		await page.getByLabel('Close settings').click();

		await dragMouse(page, { x: 367, y: 242 }, { x: 377, y: 242 });

		await expect
			.poll(
				async () => {
					const shape = (await storedObjects(page, id)).find((o) => o.type === 'shape');
					return shape ? [Math.round(shape.transform.x), Math.round(shape.transform.y)] : null;
				},
				{ timeout: TIMEOUT }
			)
			.toEqual([320, 192]);

		await expect
			.poll(async () => (await readStoredBoard(page, id))?.grid?.snap ?? null, { timeout: TIMEOUT })
			.toBe(true);
	});
});
