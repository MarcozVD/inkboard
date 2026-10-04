import { chromium, type FullConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Warm the Vite dev server before any test: first load can trigger dependency
 * discovery and a full page reload, which would swallow the first click.
 * Waits for the hydration signal on both the home and a board route.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
	const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:1420';
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		// the first cold load can take a while while Vite prebundles; wait for
		// the hydration signal instead of the (slow) load event
		await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
		await page.waitForSelector('body[data-ready="true"]', { timeout: 120_000 });
		await page.goto(`${baseURL}/board/${randomUUID()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
		await page.waitForSelector('body[data-ready="true"]', { timeout: 120_000 });
		await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });
	} finally {
		await browser.close();
	}
}
