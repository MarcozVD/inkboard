import { test, expect } from '@playwright/test';
import { canvasBox, createBoard, dragMouse, selectTool, storedObjects, waitForObjectCount } from './helpers';

const TIMEOUT = 8000;

async function strokeColor(page: Parameters<typeof storedObjects>[0], id: string): Promise<unknown> {
	const stroke = (await storedObjects(page, id)).find((o) => o.type === 'stroke');
	return stroke?.style?.color ?? null;
}

test.describe('M1-03 — styles', () => {
	test('a new pen stroke uses the last picked color', async ({ page }) => {
		const id = await createBoard(page);

		await selectTool(page, 'pen');
		// pick the third content swatch (#ff9f66)
		await page.getByTestId('pen-color-2').click();
		await dragMouse(page, { x: 300, y: 250 }, { x: 500, y: 350 }, 8);
		await waitForObjectCount(page, id, 1);

		await expect.poll(async () => strokeColor(page, id), { timeout: TIMEOUT }).toBe('#ff9f66');
	});

	test('changing the color of a selected stroke is undoable', async ({ page }) => {
		const id = await createBoard(page);
		await selectTool(page, 'pen');
		await dragMouse(page, { x: 300, y: 250 }, { x: 500, y: 350 }, 8);
		await waitForObjectCount(page, id, 1);
		await expect.poll(async () => strokeColor(page, id), { timeout: TIMEOUT }).toBe('ink');

		// select the stroke through its midpoint
		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 400, box.y + 300);

		const swatch = page.getByTestId('stroke-color-3'); // #ff7a7a
		await expect(swatch).toBeVisible();
		await swatch.click();
		await expect.poll(async () => strokeColor(page, id), { timeout: TIMEOUT }).toBe('#ff7a7a');

		await page.keyboard.press('Control+z');
		await expect.poll(async () => strokeColor(page, id), { timeout: TIMEOUT }).toBe('ink');
	});
});
