import { test, expect } from '@playwright/test';
import { canvasBox, createBoard, drawShape, selectTool, storedObjects, waitForObjectCount } from './helpers';

const TIMEOUT = 8000;

test.describe('rotate handle reachability', () => {
	test('the context toolbar never covers the rotate handle; real-mouse rotation works', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 600, y: 400 });
		await waitForObjectCount(page, id, 1);

		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 450, box.y + 300);

		// the toolbar is visible (with style controls) but must not cover the handle
		await expect(page.locator('.ctx-toolbar')).toBeVisible();
		const handle = { x: box.x + 450, y: box.y + 160 };
		const topTag = await page.evaluate(
			([hx, hy]) => document.elementFromPoint(hx, hy)?.tagName ?? null,
			[handle.x, handle.y]
		);
		expect(topTag).toBe('CANVAS');

		// real-mouse drag on the rotate handle
		await page.mouse.move(handle.x, handle.y);
		await page.mouse.down();
		await page.mouse.move(handle.x + 140, handle.y + 140, { steps: 10 });
		await page.mouse.up();

		await expect
			.poll(
				async () => {
					const shape = (await storedObjects(page, id)).find((o) => o.type === 'shape');
					return shape ? shape.transform.rotation : 0;
				},
				{ timeout: TIMEOUT }
			)
			.toBeGreaterThan(0.5);
	});
});
