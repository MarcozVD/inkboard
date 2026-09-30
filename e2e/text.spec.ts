import { test, expect } from '@playwright/test';
import { createBoard, selectTool, storedObjects, type StoredObject } from './helpers';

const TIMEOUT = 8000;

function objectByType(objects: StoredObject[], type: string): StoredObject | undefined {
	return objects.find((o) => o.type === type);
}

test.describe('B03 — in-canvas text editing', () => {
	test('text tool: typing and Enter persists the content', async ({ page }) => {
		const id = await createBoard(page);

		await selectTool(page, 'text');
		await page.mouse.click(500, 300);

		const editor = page.locator('textarea.text-editor');
		await expect(editor).toBeVisible({ timeout: 3000 });
		await expect(editor).toBeFocused();

		await page.keyboard.type('Hello board');
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();

		await expect
			.poll(async () => objectByType(await storedObjects(page, id), 'text')?.content ?? null, {
				timeout: TIMEOUT
			})
			.toBe('Hello board');
	});

	test('sticky tool: typing and Enter persists the content', async ({ page }) => {
		const id = await createBoard(page);

		await selectTool(page, 'sticky');
		await page.mouse.click(600, 300);

		const editor = page.locator('textarea.text-editor');
		await expect(editor).toBeVisible({ timeout: 3000 });
		await expect(editor).toBeFocused();

		await page.keyboard.type('Note');
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();

		await expect
			.poll(async () => objectByType(await storedObjects(page, id), 'sticky_note')?.content ?? null, {
				timeout: TIMEOUT
			})
			.toBe('Note');
	});
});
