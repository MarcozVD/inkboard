import { test, expect } from '@playwright/test';
import { createBoard, dragMouse, selectTool, waitForObjectCount } from './helpers';
import type { Page } from '@playwright/test';

const TIMEOUT = 8000;

function pixelAt(page: Page, point: { x: number; y: number }) {
	return page.locator('canvas.board-canvas').evaluate((canvas, p) => {
		const dpr = window.devicePixelRatio || 1;
		const data = canvas.getContext('2d')!.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data;
		return `${data[0]},${data[1]},${data[2]}`;
	}, point);
}

test.describe('M1-10 — canvas theme', () => {
	test('light/dark change background and ink; the choice persists on reload', async ({ page }) => {
		const id = await createBoard(page);

		// dark default: background token + semantic ink stroke
		await expect.poll(() => pixelAt(page, { x: 910, y: 610 }), { timeout: TIMEOUT }).toBe('15,16,19');

		await selectTool(page, 'pen');
		await page.getByTestId('pen-width-3').click(); // 12px ink
		await dragMouse(page, { x: 300, y: 250 }, { x: 500, y: 250 });
		await waitForObjectCount(page, id, 1);
		await expect.poll(() => pixelAt(page, { x: 400, y: 250 }), { timeout: TIMEOUT }).toBe('232,233,236');

		// switch to light via Settings
		await page.getByLabel('Settings').click();
		await page.locator('#sp-theme').selectOption('light');
		await page.getByLabel('Close settings').click();

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect.poll(() => pixelAt(page, { x: 910, y: 610 }), { timeout: TIMEOUT }).toBe('245,245,247');
		await expect.poll(() => pixelAt(page, { x: 400, y: 250 }), { timeout: TIMEOUT }).toBe('27,29,34');

		// persisted after reload
		await page.reload();
		await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await expect.poll(() => pixelAt(page, { x: 910, y: 610 }), { timeout: TIMEOUT }).toBe('245,245,247');
	});

	test('system theme follows prefers-color-scheme', async ({ page }) => {
		await createBoard(page);
		await page.emulateMedia({ colorScheme: 'light' });
		await page.getByLabel('Settings').click();
		await page.locator('#sp-theme').selectOption('system');
		await page.getByLabel('Close settings').click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

		await page.emulateMedia({ colorScheme: 'dark' });
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	});
});
