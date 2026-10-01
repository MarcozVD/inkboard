import { test, expect, type Page } from '@playwright/test';
import {
	canvasBox,
	createBoard,
	drawShape,
	dragMouse,
	selectTool,
	storedObjects,
	waitForObjectCount,
	type Point,
	type StoredObject
} from './helpers';

const TIMEOUT = 8000;

function shapeAt(objects: StoredObject[], index = 0): StoredObject | undefined {
	return objects.filter((o) => o.type === 'shape')[index];
}

/**
 * Dispatch a synthetic PointerEvent straight at the canvas element.
 * The context toolbar (fixed, above the selection) covers the rotate handle,
 * so a real mouse drag cannot reach it. `point` is canvas-local.
 */
async function dispatchPointer(
	page: Page,
	type: 'pointerdown' | 'pointermove' | 'pointerup',
	point: Point,
	buttons: number
): Promise<void> {
	const box = await canvasBox(page);
	await page.locator('canvas.board-canvas').evaluate(
		(canvas, args) => {
			canvas.dispatchEvent(
				new PointerEvent(args.type, {
					bubbles: true,
					cancelable: true,
					composed: true,
					clientX: args.x,
					clientY: args.y,
					button: 0,
					buttons: args.buttons,
					pointerId: 1,
					pointerType: 'mouse',
					isPrimary: true,
					pressure: 0.5
				})
			);
		},
		{ type, x: box.x + point.x, y: box.y + point.y, buttons }
	);
}

test.describe('B01 — selection and transforms', () => {
	test('click selects a shape and dragging moves it', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 600, y: 400 });
		await waitForObjectCount(page, id, 1);

		await selectTool(page, 'select');
		await dragMouse(page, { x: 450, y: 300 }, { x: 570, y: 380 });

		await expect
			.poll(async () => Math.round(shapeAt(await storedObjects(page, id))?.transform.x ?? NaN), {
				timeout: TIMEOUT
			})
			.toBe(420);
		await expect
			.poll(async () => Math.round(shapeAt(await storedObjects(page, id))?.transform.y ?? NaN), {
				timeout: TIMEOUT
			})
			.toBe(280);
	});

	test('dragging the SE handle resizes the selection', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 600, y: 400 });
		await waitForObjectCount(page, id, 1);

		await selectTool(page, 'select');
		await page.mouse.click(450, 300);
		await page.waitForTimeout(100);

		// SE handle sits at the object's world bottom-right corner (camera 1:1)
		await dragMouse(page, { x: 600, y: 400 }, { x: 700, y: 450 });

		await expect
			.poll(async () => Math.round(shapeAt(await storedObjects(page, id))?.transform.width ?? NaN), {
				timeout: TIMEOUT
			})
			.toBe(400);
		await expect
			.poll(async () => Math.round(shapeAt(await storedObjects(page, id))?.transform.height ?? NaN), {
				timeout: TIMEOUT
			})
			.toBe(250);
	});

	test('dragging the rotate handle rotates the selection', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 600, y: 400 });
		await waitForObjectCount(page, id, 1);

		await selectTool(page, 'select');
		await page.mouse.click(450, 300);
		await page.waitForTimeout(100);

		// rotate handle: selection center-x, 40px above the top edge
		await dispatchPointer(page, 'pointerdown', { x: 450, y: 160 }, 1);
		await dispatchPointer(page, 'pointermove', { x: 548, y: 202 }, 1);
		await dispatchPointer(page, 'pointermove', { x: 590, y: 300 }, 1);
		await dispatchPointer(page, 'pointerup', { x: 590, y: 300 }, 0);

		await expect
			.poll(async () => shapeAt(await storedObjects(page, id))?.transform.rotation ?? NaN, {
				timeout: TIMEOUT
			})
			.toBeGreaterThan(Math.PI / 2 - 0.1);
		await expect
			.poll(async () => shapeAt(await storedObjects(page, id))?.transform.rotation ?? NaN, {
				timeout: TIMEOUT
			})
			.toBeLessThan(Math.PI / 2 + 0.1);
	});

	test('marquee over empty space selects objects, Delete removes them', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 280, y: 220 }, { x: 380, y: 320 });
		await drawShape(page, 'rect', { x: 480, y: 220 }, { x: 580, y: 320 });
		await waitForObjectCount(page, id, 2);

		await selectTool(page, 'select');
		await dragMouse(page, { x: 260, y: 180 }, { x: 620, y: 360 });
		await page.keyboard.press('Delete');

		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT }).toBe(0);
	});
});

async function drawAndAssertUnderCursor(page: Page): Promise<void> {
	const id = await createBoard(page);
	await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 350 });
	const objects = await waitForObjectCount(page, id, 1);
	const shape = shapeAt(objects);

	// world coords are canvas-local: the object lands where the pointer was
	expect(Math.abs((shape?.transform.x ?? NaN) - 300)).toBeLessThanOrEqual(1);
	expect(Math.abs((shape?.transform.y ?? NaN) - 200)).toBeLessThanOrEqual(1);

	// backing store = CSS size × devicePixelRatio
	const dims = await page.locator('canvas.board-canvas').evaluate((c) => {
		const r = c.getBoundingClientRect();
		return { w: c.width, h: c.height, cssW: r.width, cssH: r.height, dpr: window.devicePixelRatio || 1 };
	});
	expect(dims.w).toBe(Math.round(dims.cssW * dims.dpr));
	expect(dims.h).toBe(Math.round(dims.cssH * dims.dpr));
}

test.describe('B02 — pointer coordinates', () => {
	test('shape lands under the cursor at DPR 1', async ({ page }) => {
		await drawAndAssertUnderCursor(page);
	});

	test('Shift keeps an ellipse circular', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'ellipse', { x: 300, y: 200 }, { x: 500, y: 350 }, { shift: true });
		const objects = await waitForObjectCount(page, id, 1);
		const shape = shapeAt(objects);

		expect(shape?.shape).toBe('ellipse');
		expect(Math.abs((shape?.transform.width ?? NaN) - 200)).toBeLessThanOrEqual(1);
		expect(Math.abs((shape?.transform.height ?? NaN) - 200)).toBeLessThanOrEqual(1);
	});
});

test.describe('B02 — pointer coordinates at DPR 2', () => {
	test.use({ deviceScaleFactor: 2 });

	test('shape lands under the cursor at DPR 2', async ({ page }) => {
		await drawAndAssertUnderCursor(page);
	});
});

test.describe('B06 — eraser undo', () => {
	test('undo restores every object erased in one gesture', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 280, y: 220 }, { x: 380, y: 320 });
		await drawShape(page, 'rect', { x: 480, y: 220 }, { x: 580, y: 320 });
		await waitForObjectCount(page, id, 2);

		await selectTool(page, 'eraser');
		await dragMouse(page, { x: 330, y: 270 }, { x: 530, y: 270 }, 5);
		// wait until the erasure is actually persisted before undoing,
		// otherwise the stored board still holds the pre-erase state
		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT }).toBe(0);

		await page.keyboard.press('Control+z');

		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT }).toBe(2);
	});
});

test.describe('B07 — z-order', () => {
	test('bring to front changes paint order and undo reverts it', async ({ page }) => {
		const id = await createBoard(page);
		const canvas = page.locator('canvas.board-canvas');
		const box = await canvasBox(page);

		// sticky A (yellow) at (400,250)
		await selectTool(page, 'sticky');
		await page.mouse.click(box.x + 400, box.y + 250);
		let editor = page.locator('textarea.text-editor');
		await expect(editor).toBeVisible({ timeout: 3000 });
		await page.keyboard.type('AAAA');
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();

		// sticky B (orange) overlapping at (430,280)
		await selectTool(page, 'sticky');
		await page.getByTitle('Color 1').click();
		await page.mouse.click(box.x + 430, box.y + 280);
		editor = page.locator('textarea.text-editor');
		await expect(editor).toBeVisible({ timeout: 3000 });
		await page.keyboard.type('BBBB');
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();

		await waitForObjectCount(page, id, 2);

		// pixel in the overlap region (canvas-local coords, camera 1:1)
		const overlapPixel = () =>
			canvas.evaluate((c) => {
				const ctx = c.getContext('2d')!;
				const dpr = window.devicePixelRatio || 1;
				const d = ctx.getImageData(Math.round(445 * dpr), Math.round(287 * dpr), 1, 1).data;
				return `${d[0]},${d[1]},${d[2]}`;
			});

		// B (orange #FF9F66) is painted on top
		await expect.poll(overlapPixel, { timeout: TIMEOUT }).toBe('255,159,102');

		// select A on its exposed part and bring it to the front
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 410, box.y + 260);
		await page.keyboard.press('Control+]');
		await expect.poll(overlapPixel, { timeout: TIMEOUT }).toBe('255,214,102');

		// stored order changed too (paint order = zIndex ascending)
		await expect
			.poll(
				async () => {
					const objs = await storedObjects(page, id);
					return objs.findIndex((o) => o.content === 'AAAA') > objs.findIndex((o) => o.content === 'BBBB');
				},
				{ timeout: TIMEOUT }
			)
			.toBe(true);

		await page.keyboard.press('Control+z');
		await expect.poll(overlapPixel, { timeout: TIMEOUT }).toBe('255,159,102');
	});
});

test.describe('B11 — stroke transforms', () => {
	test('a stroke can be moved', async ({ page }) => {
		const id = await createBoard(page);
		await selectTool(page, 'pen');
		await dragMouse(page, { x: 300, y: 250 }, { x: 500, y: 350 }, 12);
		await waitForObjectCount(page, id, 1);

		await selectTool(page, 'select');
		await dragMouse(page, { x: 400, y: 300 }, { x: 450, y: 330 });

		await expect
			.poll(
				async () => {
					const stroke = (await storedObjects(page, id)).find((o) => o.type === 'stroke');
					return stroke?.points ? Math.round(stroke.points[0]) : NaN;
				},
				{ timeout: TIMEOUT }
			)
			.toBe(350);
		await expect
			.poll(
				async () => {
					const stroke = (await storedObjects(page, id)).find((o) => o.type === 'stroke');
					return stroke?.points ? Math.round(stroke.points[1]) : NaN;
				},
				{ timeout: TIMEOUT }
			)
			.toBe(280);
	});
});

test.describe('B12 — rotation convention', () => {
	test('a corner of a 45°-rotated rect selects it; the AABB corner does not', async ({ page }) => {
		const id = await createBoard(page);
		const box = await canvasBox(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 400 });
		await waitForObjectCount(page, id, 1);

		// select, then rotate 45° around the box center (400,300) via the rotate handle
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 400, box.y + 300);
		await dispatchPointer(page, 'pointerdown', { x: 400, y: 160 }, 1);
		await dispatchPointer(page, 'pointermove', { x: 499, y: 201 }, 1);
		await dispatchPointer(page, 'pointerup', { x: 499, y: 201 }, 0);
		await expect
			.poll(
				async () => {
					const shape = shapeAt(await storedObjects(page, id));
					return shape ? Math.abs(shape.transform.rotation - Math.PI / 4) < 0.05 : false;
				},
				{ timeout: TIMEOUT }
			)
			.toBe(true);

		await page.keyboard.press('Escape');
		await expect(page.locator('.ctx-toolbar')).toHaveCount(0);

		// the old AABB corner is outside the rotated rect → no selection
		await page.mouse.click(box.x + 595, box.y + 395);
		await expect(page.locator('.ctx-toolbar')).toHaveCount(0);

		// the rotated corner selects it
		await page.mouse.click(box.x + 538, box.y + 298);
		await expect(page.locator('.ctx-toolbar')).toHaveCount(1);

		await page.keyboard.press('Delete');
		await expect.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT }).toBe(0);
	});
});
