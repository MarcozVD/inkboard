import { test, expect } from '@playwright/test';
import { createBoard, storedObjects, waitForObjectCount } from './helpers';

const IMPORTED_OBJECT = {
	id: 'imported-1',
	type: 'shape',
	shape: 'rect',
	style: { fill: 'none', stroke: '#e8e9ec', strokeWidth: 2, opacity: 1 },
	transform: { x: 120, y: 120, width: 60, height: 60, rotation: 0, scaleX: 1, scaleY: 1 },
	locked: false,
	visible: true,
	createdAt: 1,
	updatedAt: 1
};

function importedFile(): string {
	return JSON.stringify({
		schemaVersion: '1.1.0',
		version: 1,
		board: {
			id: 'fixture-board',
			workspaceId: 'default',
			name: 'Imported fixture',
			version: 1,
			schemaVersion: '1.1.0',
			createdAt: 1,
			updatedAt: 1,
			camera: { x: 0, y: 0, zoom: 1, minZoom: 0.05, maxZoom: 32 },
			objects: [IMPORTED_OBJECT],
			background: { type: 'solid', color: '#0f1013' },
			grid: { enabled: true, size: 32, color: 'grid', opacity: 0.6 },
			metadata: {}
		}
	});
}

test.describe('M2-07 — internal JSON import', () => {
	test('inserts into the current board as one undo step', async ({ page }) => {
		const id = await createBoard(page);

		const chooserPromise = page.waitForEvent('filechooser');
		await page.getByTestId('export').click();
		await page.getByTestId('insert-file').click();
		const chooser = await chooserPromise;
		await chooser.setFiles({
			name: 'board.json',
			mimeType: 'application/json',
			buffer: Buffer.from(importedFile(), 'utf8')
		});
		await waitForObjectCount(page, id, 1);
		expect((await storedObjects(page, id))[0].type).toBe('shape');

		// a single undo removes the whole import
		await page.locator('canvas.board-canvas').click({ position: { x: 900, y: 600 } });
		await page.keyboard.press('Control+z');
		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: 8000 }).toBe(0);

		// redo restores it as one step too
		await page.keyboard.press('Control+Shift+z');
		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: 8000 }).toBe(1);
	});

	test('imports as a new board and opens it', async ({ page }) => {
		const current = await createBoard(page);

		const chooserPromise = page.waitForEvent('filechooser');
		await page.getByTestId('export').click();
		await page.getByTestId('import-file').click();
		const chooser = await chooserPromise;
		await chooser.setFiles({
			name: 'board.json',
			mimeType: 'application/json',
			buffer: Buffer.from(importedFile(), 'utf8')
		});

		await page.waitForURL((url) => !url.pathname.startsWith(`/board/${current}`), { timeout: 10_000 });
		const newId = page.url().split('/board/')[1].replace(/\/$/, '').split('?')[0];
		expect(newId).not.toBe(current);
		await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });
		await waitForObjectCount(page, newId, 1);
	});

	test('the .inkboard option is hidden outside Tauri', async ({ page }) => {
		await createBoard(page);
		await page.getByTestId('export').click();
		await expect(page.getByTestId('export-json')).toBeVisible();
		await expect(page.getByTestId('export-inkboard')).toHaveCount(0);
	});
});
