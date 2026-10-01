import { test, expect } from '@playwright/test';
import { canvasBox, createBoard, dragMouse, selectTool, storedObjects, waitForObjectCount } from './helpers';
import type { StoredObject } from './helpers';

const TIMEOUT = 8000;

function centerOf(obj: StoredObject): { x: number; y: number } {
	return {
		x: obj.transform.x + obj.transform.width / 2,
		y: obj.transform.y + obj.transform.height / 2
	};
}

function connectorOf(objects: StoredObject[]): StoredObject | undefined {
	return objects.find((o) => o.type === 'connector');
}

test.describe('M1-09 — connectors', () => {
	test('connect two stickies, move one and the connector follows; undo', async ({ page }) => {
		const id = await createBoard(page);

		// sticky A
		await selectTool(page, 'sticky');
		await page.mouse.click((await canvasBox(page)).x + 400, (await canvasBox(page)).y + 250);
		let editor = page.locator('textarea.text-editor');
		await expect(editor).toBeVisible({ timeout: 3000 });
		await page.keyboard.type('AAAA');
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();

		// sticky B
		await selectTool(page, 'sticky');
		await page.mouse.click((await canvasBox(page)).x + 650, (await canvasBox(page)).y + 250);
		editor = page.locator('textarea.text-editor');
		await expect(editor).toBeVisible({ timeout: 3000 });
		await page.keyboard.type('BBBB');
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();

		await waitForObjectCount(page, id, 2);
		const objects = await storedObjects(page, id);
		const a = objects.find((o) => o.content === 'AAAA')!;
		const b = objects.find((o) => o.content === 'BBBB')!;

		// drag from A's east anchor to B's west anchor
		const box = await canvasBox(page);
		const from = { x: a.transform.x + a.transform.width, y: a.transform.y + a.transform.height / 2 };
		const to = { x: b.transform.x, y: b.transform.y + b.transform.height / 2 };
		await selectTool(page, 'connector');
		await page.mouse.move(box.x + from.x, box.y + from.y);
		await page.mouse.down();
		await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
		await page.mouse.up();

		await expect
			.poll(async () => connectorOf(await storedObjects(page, id))?.startObjectId ?? null, { timeout: TIMEOUT })
			.toBe(a.id);
		const connector = connectorOf(await storedObjects(page, id))!;
		expect(connector.endObjectId).toBe(b.id);

		// undo/redo of the creation
		await page.keyboard.press('Control+z');
		await expect.poll(async () => connectorOf(await storedObjects(page, id)) ?? null, { timeout: TIMEOUT }).toBeNull();
		await page.keyboard.press('Control+Shift+z');
		await expect
			.poll(async () => connectorOf(await storedObjects(page, id))?.endObjectId ?? null, { timeout: TIMEOUT })
			.toBe(b.id);

		// move A down: the connector follows its anchor (east side slides with the box)
		await selectTool(page, 'select');
		const aCenter = centerOf(a);
		await page.mouse.click(box.x + aCenter.x, box.y + aCenter.y);
		await dragMouse(page, aCenter, { x: aCenter.x, y: aCenter.y + 80 });

		await expect
			.poll(
				async () => {
					const moved = connectorOf(await storedObjects(page, id));
					return moved ? Math.round(moved.startPoint!.y) : null;
				},
				{ timeout: TIMEOUT }
			)
			.toBe(352);
		expect(connectorOf(await storedObjects(page, id))?.startObjectId).toBe(a.id);

		await page.keyboard.press('Control+z');
		await expect
			.poll(
				async () => {
					const moved = connectorOf(await storedObjects(page, id));
					return moved ? Math.round(moved.startPoint!.y) : null;
				},
				{ timeout: TIMEOUT }
			)
			.toBe(295);
	});
});
