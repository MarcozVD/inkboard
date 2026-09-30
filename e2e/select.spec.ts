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
 * so a real mouse drag cannot reach it.
 */
async function dispatchPointer(
	page: Page,
	type: 'pointerdown' | 'pointermove' | 'pointerup',
	point: Point,
	buttons: number
): Promise<void> {
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
		{ type, x: point.x, y: point.y, buttons }
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
		await drawShape(page, 'rect', { x: 200, y: 200 }, { x: 300, y: 300 });
		await drawShape(page, 'rect', { x: 400, y: 200 }, { x: 500, y: 300 });
		await waitForObjectCount(page, id, 2);

		await selectTool(page, 'select');
		await dragMouse(page, { x: 150, y: 150 }, { x: 550, y: 350 });
		await page.keyboard.press('Delete');

		await expect
			.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT })
			.toBe(0);
	});
});

test.describe('B02 — pointer coordinates', () => {
	test('a drawn shape lands under the cursor (canvas offset + DPR)', async ({ page }) => {
		const id = await createBoard(page);
		const box = await canvasBox(page);

		await drawShape(
			page,
			'rect',
			{ x: box.x + 300, y: box.y + 200 },
			{ x: box.x + 500, y: box.y + 350 }
		);
		const objects = await waitForObjectCount(page, id, 1);
		const shape = shapeAt(objects);

		// world coords are canvas-local: client minus the canvas box origin
		expect(Math.abs((shape?.transform.x ?? NaN) - 300)).toBeLessThanOrEqual(1);
		expect(Math.abs((shape?.transform.y ?? NaN) - 200)).toBeLessThanOrEqual(1);
	});
});

test.describe('B06 — eraser undo', () => {
	test('undo restores every object erased in one gesture', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 200, y: 200 }, { x: 300, y: 300 });
		await drawShape(page, 'rect', { x: 400, y: 200 }, { x: 500, y: 300 });
		await waitForObjectCount(page, id, 2);

		await selectTool(page, 'eraser');
		await dragMouse(page, { x: 250, y: 250 }, { x: 450, y: 250 }, 5);
		// wait until the erasure is actually persisted before undoing,
		// otherwise the stored board still holds the pre-erase state
		await expect
			.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT })
			.toBe(0);

		await page.keyboard.press('Control+z');

		await expect
			.poll(async () => (await storedObjects(page, id)).length, { timeout: TIMEOUT })
			.toBe(2);
	});
});
