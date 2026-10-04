import { test, expect, type Download, type Page } from '@playwright/test';
import fs from 'node:fs';
import { canvasBox, createBoard, drawShape, selectTool, waitForObjectCount } from './helpers';

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function savedBuffer(download: Download): Promise<Buffer> {
	const file = await download.path();
	if (!file) throw new Error('download has no path');
	return fs.readFileSync(file);
}

async function exportAs(
	page: Page,
	format: 'png' | 'svg',
	options: { mode: string; scale: number; transparent: boolean }
): Promise<Download> {
	// the menu may still be open after a previous import
	if (
		!(await page
			.getByTestId('export-format')
			.isVisible()
			.catch(() => false))
	) {
		await page.getByTestId('export').click();
	}
	await page.getByTestId('export-format').waitFor({ state: 'visible' });
	await page.getByTestId('export-format').selectOption(format);
	await page.getByTestId('export-mode').selectOption(options.mode);
	await page.getByTestId('export-scale').selectOption(String(options.scale));
	const checkbox = page.getByTestId('export-transparent');
	if (options.transparent) await checkbox.check();
	else await checkbox.uncheck();
	const download = page.waitForEvent('download');
	await page.getByTestId('export-run').click();
	return download;
}

test.describe('M2-10 — SVG fidelity and PDF', () => {
	test('the exported SVG rasterizes within 1% of the canvas PNG', async ({ page }) => {
		const id = await createBoard(page);

		// mixed board: stroke, star, text, sticky
		const box = await canvasBox(page);
		await selectTool(page, 'pen');
		await page.mouse.move(box.x + 120, box.y + 520);
		await page.mouse.down();
		for (let i = 0; i < 14; i++) {
			await page.mouse.move(box.x + 120 + i * 26, box.y + 520 + Math.sin(i / 2) * 40);
		}
		await page.mouse.up();

		await drawShape(page, 'star', { x: 620, y: 180 }, { x: 780, y: 340 });
		await drawShape(page, 'rect', { x: 260, y: 180 }, { x: 460, y: 330 });

		await selectTool(page, 'text');
		await page.mouse.click(box.x + 300, box.y + 400);
		await page.keyboard.type('Hello SVG fidelity');
		await page.keyboard.press('Enter');

		await selectTool(page, 'sticky');
		await page.mouse.click(box.x + 850, box.y + 430);
		await page.keyboard.type('sticky note text');
		await page.keyboard.press('Enter');

		// one image through the asset pipeline
		const chooserPromise = page.waitForEvent('filechooser');
		await page.getByTestId('export').click();
		await page.getByTestId('import-file').click();
		const chooser = await chooserPromise;
		await chooser.setFiles({
			name: 'dot.png',
			mimeType: 'image/png',
			buffer: Buffer.from(PNG_1X1, 'base64')
		});
		await waitForObjectCount(page, id, 6);

		const png = await savedBuffer(await exportAs(page, 'png', { mode: 'board', scale: 1, transparent: false }));
		const svgBuffer = await savedBuffer(await exportAs(page, 'svg', { mode: 'board', scale: 1, transparent: false }));
		const svgText = svgBuffer.toString('utf8');

		const diff = await page.evaluate(
			async ({ pngBase64, svg }) => {
				const loadPng = async () => {
					const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
					return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
				};
				const loadSvg = async () => {
					const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
					const img = new Image();
					await new Promise<void>((resolve, reject) => {
						img.onload = () => resolve();
						img.onerror = () => reject(new Error('svg decode failed'));
						img.src = url;
					});
					URL.revokeObjectURL(url);
					return img;
				};
				const pngImage = await loadPng();
				const svgImage = await loadSvg();
				const width = pngImage.width;
				const height = pngImage.height;

				const blank = () => {
					const canvas = document.createElement('canvas');
					canvas.width = width;
					canvas.height = height;
					return canvas.getContext('2d')!;
				};
				const pngCtx = blank();
				pngCtx.drawImage(pngImage, 0, 0, width, height);
				const svgCtx = blank();
				svgCtx.drawImage(svgImage, 0, 0, width, height);
				const a = pngCtx.getImageData(0, 0, width, height).data;
				const b = svgCtx.getImageData(0, 0, width, height).data;

				const THRESHOLD = 48;
				const close = (i: number, j: number) =>
					Math.abs(a[i] - b[j]) <= THRESHOLD &&
					Math.abs(a[i + 1] - b[j + 1]) <= THRESHOLD &&
					Math.abs(a[i + 2] - b[j + 2]) <= THRESHOLD &&
					Math.abs(a[i + 3] - b[j + 3]) <= THRESHOLD;

				let different = 0;
				for (let y = 0; y < height; y++) {
					for (let x = 0; x < width; x++) {
						const i = (y * width + x) * 4;
						if (close(i, i)) continue;
						// antialias / subpixel tolerance: any neighbour within 1px matches
						let ok = false;
						for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1) && !ok; ny++) {
							for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1) && !ok; nx++) {
								if (close(i, (ny * width + nx) * 4)) ok = true;
							}
						}
						if (!ok) different++;
					}
				}
				return { width, height, diffRatio: different / (width * height) };
			},
			{ pngBase64: png.toString('base64'), svg: svgText }
		);

		console.log(`[svg-fidelity] ${diff.width}×${diff.height} diff=${(diff.diffRatio * 100).toFixed(3)}%`);
		expect(diff.width).toBeGreaterThan(100);
		expect(diff.diffRatio).toBeLessThan(0.01);
	});

	test('the PDF option is hidden outside Tauri', async ({ page }) => {
		await createBoard(page);
		await page.getByTestId('export').click();
		await expect(page.getByTestId('export-format').locator('option[value="pdf"]')).toHaveCount(0);
	});
});
