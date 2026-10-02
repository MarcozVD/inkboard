import { test, expect } from '@playwright/test';
import { createBoard, drawShape, waitForObjectCount } from './helpers';

test.describe('M2-03 — board thumbnails', () => {
	test('a real thumbnail appears on Home after leaving the board', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 350 });
		await waitForObjectCount(page, id, 1);

		// leaving the board flushes the thumbnail (the 10 s debounce is bypassed)
		await page.goto('/');
		const thumb = page.locator(`[data-testid="board-thumb-${id}"]`);
		await expect(thumb).toHaveAttribute('src', /^data:image\/png;base64,/, { timeout: 10_000 });
		await expect(thumb).toHaveJSProperty('tagName', 'IMG');
	});
});
