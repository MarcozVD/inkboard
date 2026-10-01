import { test, expect } from '@playwright/test';
import { createBoard, drawShape, storedObjects, waitForObjectCount } from './helpers';

test.describe('B09 — tool shortcuts', () => {
	test('S/N activate sticky; R/O/L/A pick the concrete shape', async ({ page }) => {
		await createBoard(page);

		await page.keyboard.press('s');
		await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true');

		await page.keyboard.press('o');
		await expect(page.getByTestId('tool-shape')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTitle('ellipse')).toHaveClass(/active/);

		await page.keyboard.press('l');
		await expect(page.getByTitle('line')).toHaveClass(/active/);

		await page.keyboard.press('r');
		await expect(page.getByTitle('rect')).toHaveClass(/active/);

		await page.keyboard.press('a');
		await expect(page.getByTitle('arrow')).toHaveClass(/active/);

		await page.keyboard.press('n');
		await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true');
	});

	test('UI hints come from the shared shortcut table', async ({ page }) => {
		await createBoard(page);

		await expect(page.getByTestId('tool-sticky').locator('kbd')).toHaveText('S');
		await expect(page.getByTestId('tool-shape').locator('kbd')).toHaveText('R');

		await page.keyboard.press('Control+k');
		await expect(page.locator('.palette-item').filter({ hasText: 'Sticky note' }).locator('.pi-hint')).toHaveText('S');
		await expect(page.locator('.palette-item').filter({ hasText: 'Shapes' }).locator('.pi-hint')).toHaveText('R');
	});
});

test.describe('B04 — keyboard events inside inputs', () => {
	test('typing in the rename input does not change tool or zoom', async ({ page }) => {
		await createBoard(page);

		await page.locator('.name-display').click();
		const input = page.locator('.name-input');
		await expect(input).toBeVisible();

		await input.pressSequentially('Plan');
		await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');

		await input.pressSequentially('+');
		await expect(page.locator('.zc-label')).toHaveText('100%');
		await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
	});

	test('typing in the command palette does not change tool', async ({ page }) => {
		await createBoard(page);

		await page.keyboard.press('Control+k');
		const paletteInput = page.getByPlaceholder('Type a command…');
		await expect(paletteInput).toBeVisible();

		await paletteInput.pressSequentially('pen');
		await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
	});

	test('Backspace in an input does not delete the selection', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 350 });
		await waitForObjectCount(page, id, 1);

		await page.keyboard.press('Control+a');
		await page.locator('.name-display').click();
		await expect(page.locator('.name-input')).toBeVisible();
		await page.keyboard.press('Backspace');
		// give the (buggy) 2 s autosave debounce time to persist the deletion
		await page.waitForTimeout(3000);

		expect((await storedObjects(page, id)).length).toBe(1);
	});
});
