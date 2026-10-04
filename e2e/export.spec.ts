import { test, expect, type Download, type Page } from '@playwright/test';
import fs from 'node:fs';
import { canvasBox, createBoard, drawShape, selectTool, waitForObjectCount } from './helpers';

function pngSize(buf: Buffer): { width: number; height: number } {
	expect(buf.readUInt32BE(0)).toBe(0x89504e47);
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): { width: number; height: number } {
	expect(buf[0]).toBe(0xff);
	expect(buf[1]).toBe(0xd8);
	let i = 2;
	while (i < buf.length - 8) {
		if (buf[i] !== 0xff) {
			i++;
			continue;
		}
		const marker = buf[i + 1];
		const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
		if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
		i += 2 + buf.readUInt16BE(i + 2);
	}
	throw new Error('JPEG has no SOF marker');
}

async function savedBuffer(download: Download): Promise<Buffer> {
	const path = await download.path();
	if (!path) throw new Error('download has no path');
	return fs.readFileSync(path);
}

async function runExport(
	page: Page,
	options: { format: string; mode: string; scale: number; transparent?: boolean }
): Promise<Download> {
	await page.getByTestId('export').click();
	await page.getByTestId('export-format').selectOption(options.format);
	await page.getByTestId('export-mode').selectOption(options.mode);
	await page.getByTestId('export-scale').selectOption(String(options.scale));
	if (options.transparent !== undefined && options.format !== 'jpeg') {
		const checkbox = page.getByTestId('export-transparent');
		if (options.transparent) await checkbox.check();
		else await checkbox.uncheck();
	}
	const downloadPromise = page.waitForEvent('download');
	await page.getByTestId('export-run').click();
	return downloadPromise;
}

async function cornerAlpha(page: Page, buf: Buffer): Promise<number> {
	return page.evaluate(async (base64) => {
		const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
		const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return -1;
		ctx.drawImage(bitmap, 0, 0);
		return ctx.getImageData(0, 0, 1, 1).data[3];
	}, buf.toString('base64'));
}

test.describe('M2-09 — export modes and formats', () => {
	test('PNG/JPG dimensions match the requested area and scale', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 350 });
		await drawShape(page, 'rect', { x: 700, y: 200 }, { x: 800, y: 300 });
		await waitForObjectCount(page, id, 2);
		const canvas = await canvasBox(page);
		const view = { width: Math.round(canvas.width), height: Math.round(canvas.height) };

		// board: union bounds (300..800 × 200..350) + 20 px pad, ×2
		const boardPng = await runExport(page, { format: 'png', mode: 'board', scale: 2 });
		expect(boardPng.suggestedFilename()).toMatch(/\.png$/);
		expect(pngSize(await savedBuffer(boardPng))).toEqual({ width: 1080, height: 380 });

		// board: JPEG at 1× with the same region
		const boardJpg = await runExport(page, { format: 'jpeg', mode: 'board', scale: 1 });
		expect(boardJpg.suggestedFilename()).toMatch(/\.jpg$/);
		const jpgBuffer = await savedBuffer(boardJpg);
		expect(jpegSize(jpgBuffer)).toEqual({ width: 540, height: 190 });

		// selection: only the first rect (200×150 + pad), ×1
		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 400, box.y + 275);
		const selectionPng = await runExport(page, { format: 'png', mode: 'selection', scale: 1 });
		expect(selectionPng.suggestedFilename()).toMatch(/selection.*\.png$/);
		expect(pngSize(await savedBuffer(selectionPng))).toEqual({ width: 240, height: 190 });

		// viewport: exactly the visible canvas at 1×
		const viewportPng = await runExport(page, { format: 'png', mode: 'viewport', scale: 1 });
		expect(pngSize(await savedBuffer(viewportPng))).toEqual(view);
	});

	test('transparent background produces a PNG with alpha; default is opaque', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 350 });
		await waitForObjectCount(page, id, 1);

		const transparent = await runExport(page, {
			format: 'png',
			mode: 'board',
			scale: 1,
			transparent: true
		});
		expect(await cornerAlpha(page, await savedBuffer(transparent))).toBe(0);

		const opaque = await runExport(page, {
			format: 'png',
			mode: 'board',
			scale: 1,
			transparent: false
		});
		expect(await cornerAlpha(page, await savedBuffer(opaque))).toBe(255);
	});
});
