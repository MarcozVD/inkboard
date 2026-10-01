import { test, expect } from '@playwright/test';
import { canvasBox, createBoard, dragMouse, drawShape, selectTool, storedObjects, waitForObjectCount } from './helpers';
import type { Point } from './helpers';

const TIMEOUT = 8000;

async function dispatchPointer(
	page: Parameters<typeof canvasBox>[0],
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

test.describe('M1-13 — precise transforms', () => {
	test('resizes a 45°-rotated object along its local axes', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 500, y: 400 });
		await waitForObjectCount(page, id, 1);

		// rotate 45° around the box center (400,300)
		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 400, box.y + 300);
		await dispatchPointer(page, 'pointerdown', { x: 400, y: 160 }, 1);
		await dispatchPointer(page, 'pointermove', { x: 499, y: 201 }, 1);
		await dispatchPointer(page, 'pointerup', { x: 499, y: 201 }, 0);

		// the SE handle is rotated to (400, 441.4)
		await dispatchPointer(page, 'pointerdown', { x: 400, y: 441 }, 1);
		await dispatchPointer(page, 'pointermove', { x: 400, y: 520 }, 1);
		await dispatchPointer(page, 'pointerup', { x: 400, y: 520 }, 0);

		await expect
			.poll(
				async () => {
					const shape = (await storedObjects(page, id)).find((o) => o.type === 'shape');
					if (!shape) return null;
					return {
						w: Math.round(shape.transform.width),
						h: Math.round(shape.transform.height),
						rot: Math.round(shape.transform.rotation * 100) / 100
					};
				},
				{ timeout: TIMEOUT }
			)
			.toEqual({ w: 256, h: 256, rot: 0.79 });
	});

	test('crossing the opposite handle flips the object; undo restores it', async ({ page }) => {
		const id = await createBoard(page);
		await drawShape(page, 'rect', { x: 300, y: 200 }, { x: 400, y: 300 });
		await waitForObjectCount(page, id, 1);

		const box = await canvasBox(page);
		await selectTool(page, 'select');
		await page.mouse.click(box.x + 350, box.y + 250);

		// drag the east handle past the west edge
		await dragMouse(page, { x: 400, y: 250 }, { x: 280, y: 250 });

		await expect
			.poll(
				async () => {
					const shape = (await storedObjects(page, id)).find((o) => o.type === 'shape');
					if (!shape) return null;
					return {
						w: Math.round(shape.transform.width),
						x: Math.round(shape.transform.x),
						flipped: (shape.transform.scaleX ?? 1) < 0
					};
				},
				{ timeout: TIMEOUT }
			)
			.toEqual({ w: 20, x: 280, flipped: true });

		await page.keyboard.press('Control+z');
		await expect
			.poll(
				async () => {
					const shape = (await storedObjects(page, id)).find((o) => o.type === 'shape');
					if (!shape) return null;
					return {
						w: Math.round(shape.transform.width),
						x: Math.round(shape.transform.x),
						flipped: (shape.transform.scaleX ?? 1) < 0
					};
				},
				{ timeout: TIMEOUT }
			)
			.toEqual({ w: 100, x: 300, flipped: false });
	});
});
