import { test, expect } from '@playwright/test';
import { createBoard, storedObjects, waitForObjectCount } from './helpers';

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.describe('M2-05 — image assets', () => {
	test('an inserted image becomes an asset and survives a reload', async ({ page }) => {
		const id = await createBoard(page);

		const chooserPromise = page.waitForEvent('filechooser');
		await page.getByTestId('export').click();
		await page.getByTestId('import-file').click();
		const chooser = await chooserPromise;
		await chooser.setFiles({
			name: 'dot.png',
			mimeType: 'image/png',
			buffer: Buffer.from(PNG_1X1, 'base64')
		});
		await waitForObjectCount(page, id, 1);

		// the board JSON holds a content-addressed ref, not the bytes
		const src = String(((await storedObjects(page, id))[0] as { src?: string } | undefined)?.src ?? '');
		expect(src).toMatch(/^asset:[0-9a-f]{64}$/);
		const hash = src.slice('asset:'.length);

		// the bytes live in IndexedDB and decode back into a real image
		const decode = async () =>
			page.evaluate(async (assetHash) => {
				const row = await new Promise<{ blob?: Blob } | null>((resolve) => {
					const open = indexedDB.open('inkboard-assets', 1);
					open.onsuccess = () => {
						const get = open.result.transaction('assets', 'readonly').objectStore('assets').get(assetHash);
						get.onsuccess = () => resolve((get.result as { blob?: Blob }) ?? null);
						get.onerror = () => resolve(null);
					};
					open.onerror = () => resolve(null);
				});
				if (!row?.blob || !(row.blob instanceof Blob)) return 0;
				const bitmap = await createImageBitmap(row.blob);
				return bitmap.width;
			}, hash);
		expect(await decode()).toBeGreaterThan(0);

		// reload: the board keeps the ref and the renderer resolves it again
		await page.addInitScript(() => {
			const state = window as unknown as { __assetGets: number };
			state.__assetGets = 0;
			const original = IDBObjectStore.prototype.get;
			IDBObjectStore.prototype.get = function (this: IDBObjectStore, ...args: unknown[]) {
				state.__assetGets++;
				return original.apply(this, args as [IDBValidKey]);
			};
		});
		await page.reload();
		await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });
		await expect
			.poll(() => page.evaluate(() => (window as unknown as { __assetGets: number }).__assetGets))
			.toBeGreaterThan(0);

		const afterReload = await storedObjects(page, id);
		expect(afterReload.length).toBe(1);
		expect(String((afterReload[0] as { src?: string } | undefined)?.src ?? '')).toBe(src);
		expect(await decode()).toBeGreaterThan(0);
	});
});
