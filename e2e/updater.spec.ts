import { test, expect } from '@playwright/test';
import { createBoard } from './helpers';

declare global {
	interface Window {
		__updaterMock?: unknown;
		__installed?: boolean;
		__relaunched?: boolean;
	}
}

const availableMock = () => {
	window.__updaterMock = {
		check: async () => ({ version: '9.9.9', downloadAndInstall: async () => {} }),
		relaunch: async () => {}
	};
};

test.describe('M4-05 — updater UI flow (mocked plugin)', () => {
	test('startup check shows a discreet notice when a version is available', async ({ page }) => {
		await page.addInitScript(availableMock);
		await createBoard(page);
		await expect(page.getByTestId('board-notice')).toContainText('9.9.9', { timeout: 12_000 });
	});

	test('check + install with confirmation downloads and relaunches', async ({ page }) => {
		await page.addInitScript(() => {
			window.__updaterMock = {
				check: async () => ({
					version: '9.9.9',
					downloadAndInstall: async (onProgress?: (progress: { percent: number | null }) => void) => {
						onProgress?.({ percent: 100 });
						window.__installed = true;
					}
				}),
				relaunch: async () => {
					window.__relaunched = true;
				}
			};
		});
		await createBoard(page);
		await page.getByLabel('Settings').click();

		await page.getByTestId('check-updates').click();
		await expect(page.getByTestId('update-status')).toContainText('9.9.9');

		page.on('dialog', (dialog) => void dialog.accept());
		await page.getByTestId('install-update').click();
		await expect.poll(() => page.evaluate(() => window.__installed === true)).toBe(true);
		await expect.poll(() => page.evaluate(() => window.__relaunched === true)).toBe(true);
	});

	test('reports up to date when the plugin returns null', async ({ page }) => {
		await page.addInitScript(() => {
			window.__updaterMock = {
				check: async () => null,
				relaunch: async () => {}
			};
		});
		await createBoard(page);
		await page.getByLabel('Settings').click();
		await page.getByTestId('check-updates').click();
		await expect(page.getByTestId('update-status')).toContainText('up to date');
		await expect(page.getByTestId('install-update')).toHaveCount(0);
	});
});
