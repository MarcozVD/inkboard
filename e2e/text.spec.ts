import { test, expect, type Page } from '@playwright/test';
import { canvasBox, createBoard, selectTool, storedObjects, type Point, type StoredObject } from './helpers';

const TIMEOUT = 8000;

function objectByType(objects: StoredObject[], type: string): StoredObject | undefined {
	return objects.find((o) => o.type === type);
}

async function storedContent(page: Page, id: string, type: string): Promise<string | null> {
	return objectByType(await storedObjects(page, id), type)?.content ?? null;
}

async function clickCanvas(page: Page, point: Point): Promise<void> {
	const box = await canvasBox(page);
	await page.mouse.click(box.x + point.x, box.y + point.y);
}

async function dblclickCanvas(page: Page, point: Point): Promise<void> {
	const box = await canvasBox(page);
	await page.mouse.dblclick(box.x + point.x, box.y + point.y);
}

/** Click with text/sticky tool; the editor must open focused. */
async function openEditor(page: Page, tool: 'text' | 'sticky', point: Point) {
	await selectTool(page, tool);
	await clickCanvas(page, point);
	const editor = page.locator('textarea.text-editor');
	await expect(editor).toBeVisible({ timeout: 3000 });
	await expect(editor).toBeFocused();
	return editor;
}

async function createEditable(page: Page, tool: 'text' | 'sticky', point: Point, content: string) {
	const editor = await openEditor(page, tool, point);
	await page.keyboard.type(content);
	await page.keyboard.press('Enter');
	await expect(editor).toBeHidden();
}

test.describe('B03 — in-canvas text editing', () => {
	test('text tool: typing and Enter persists the content', async ({ page }) => {
		const id = await createBoard(page);
		await createEditable(page, 'text', { x: 500, y: 250 }, 'Hello board');

		await expect.poll(async () => storedContent(page, id, 'text'), { timeout: TIMEOUT }).toBe('Hello board');
	});

	test('sticky tool: typing and Enter persists the content', async ({ page }) => {
		const id = await createBoard(page);
		await createEditable(page, 'sticky', { x: 600, y: 250 }, 'Note');

		await expect.poll(async () => storedContent(page, id, 'sticky_note'), { timeout: TIMEOUT }).toBe('Note');
	});

	test('text: double click edits; undo reverts the edit', async ({ page }) => {
		const id = await createBoard(page);
		await createEditable(page, 'text', { x: 500, y: 250 }, 'Hello');
		await expect.poll(async () => storedContent(page, id, 'text'), { timeout: TIMEOUT }).toBe('Hello');

		await selectTool(page, 'select');
		await dblclickCanvas(page, { x: 505, y: 265 });
		const editor = page.locator('textarea.text-editor');
		await expect(editor).toBeVisible({ timeout: 3000 });
		await expect(editor).toHaveValue('Hello');

		await editor.press('Control+a');
		await page.keyboard.type('Hello world');
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();
		await expect.poll(async () => storedContent(page, id, 'text'), { timeout: TIMEOUT }).toBe('Hello world');

		await page.keyboard.press('Control+z');
		await expect.poll(async () => storedContent(page, id, 'text'), { timeout: TIMEOUT }).toBe('Hello');
	});

	test('text: Esc cancels and discards the empty text (and its history entry)', async ({ page }) => {
		await createBoard(page);
		const editor = await openEditor(page, 'text', { x: 500, y: 250 });
		await page.keyboard.type('Draft');
		await page.keyboard.press('Escape');
		await expect(editor).toBeHidden();

		await expect(page.locator('.canvas-hint')).toBeVisible();
		await expect(page.getByTestId('undo')).toBeDisabled();
		await expect(page.getByTestId('redo')).toBeDisabled();
	});

	test('text: confirming an empty text removes the object and its history entry', async ({ page }) => {
		await createBoard(page);
		const editor = await openEditor(page, 'text', { x: 500, y: 250 });
		await page.keyboard.type('tmp');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();

		await expect(page.locator('.canvas-hint')).toBeVisible();
		await expect(page.getByTestId('undo')).toBeDisabled();
		await expect(page.getByTestId('redo')).toBeDisabled();
	});

	test('sticky: double click edits; undo reverts the edit', async ({ page }) => {
		const id = await createBoard(page);
		await createEditable(page, 'sticky', { x: 600, y: 250 }, 'Note');
		await expect.poll(async () => storedContent(page, id, 'sticky_note'), { timeout: TIMEOUT }).toBe('Note');

		await selectTool(page, 'select');
		await dblclickCanvas(page, { x: 610, y: 265 });
		const editor = page.locator('textarea.text-editor');
		await expect(editor).toBeVisible({ timeout: 3000 });
		await expect(editor).toHaveValue('Note');

		await editor.press('Control+a');
		await page.keyboard.type('Note 2');
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();
		await expect.poll(async () => storedContent(page, id, 'sticky_note'), { timeout: TIMEOUT }).toBe('Note 2');

		await page.keyboard.press('Control+z');
		await expect.poll(async () => storedContent(page, id, 'sticky_note'), { timeout: TIMEOUT }).toBe('Note');
	});

	test('sticky: Esc cancels and discards the empty sticky', async ({ page }) => {
		await createBoard(page);
		const editor = await openEditor(page, 'sticky', { x: 600, y: 250 });
		await page.keyboard.type('Draft');
		await page.keyboard.press('Escape');
		await expect(editor).toBeHidden();

		await expect(page.locator('.canvas-hint')).toBeVisible();
		await expect(page.getByTestId('undo')).toBeDisabled();
	});

	test('sticky: confirming an empty sticky removes the object and its history entry', async ({ page }) => {
		await createBoard(page);
		const editor = await openEditor(page, 'sticky', { x: 600, y: 250 });
		await page.keyboard.press('Enter');
		await expect(editor).toBeHidden();

		await expect(page.locator('.canvas-hint')).toBeVisible();
		await expect(page.getByTestId('undo')).toBeDisabled();
		await expect(page.getByTestId('redo')).toBeDisabled();
	});
});
