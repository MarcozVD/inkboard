import { test, expect } from '@playwright/test';
import { createBoard } from './helpers';

test.describe('M2-02 — home board management', () => {
	test('rename, duplicate, favorite persists, trash and restore', async ({ page }) => {
		const id = await createBoard(page);
		await page.goto('/');
		const card = page.getByTestId(`board-${id}`);
		await expect(card).toBeVisible();

		// rename via the card menu
		await page.getByTestId(`board-menu-${id}`).click();
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const input = page.locator('.board-name-input');
		await input.fill('Renamed');
		await input.press('Enter');
		await expect(card.locator('.board-name')).toHaveText('Renamed');

		// favorite via the menu, then reload
		await page.getByTestId(`board-menu-${id}`).click();
		await page.getByRole('menuitem', { name: 'Favorite', exact: true }).click();
		await page.reload();
		await expect(page.getByTestId(`board-${id}`).locator('.fav-btn')).toHaveAttribute('aria-pressed', 'true');

		// duplicate
		await page.getByTestId(`board-menu-${id}`).click();
		await page.getByRole('menuitem', { name: 'Duplicate' }).click();
		const copy = page.locator('.board-card').filter({ hasText: 'Copy of Renamed' });
		await expect(copy).toHaveCount(1);

		// move the original to the trash and back
		await page.getByTestId(`board-menu-${id}`).click();
		await page.getByRole('menuitem', { name: 'Move to trash' }).click();
		await expect(page.getByTestId(`board-${id}`)).toHaveCount(0);

		await page.getByTestId('view-trash').click();
		await expect(page.getByTestId(`board-${id}`)).toBeVisible();
		await page.getByTestId(`board-menu-${id}`).click();
		await page.getByRole('menuitem', { name: 'Restore' }).click();
		await expect(page.getByTestId(`board-${id}`)).toHaveCount(0);

		await page.getByTestId('view-active').click();
		await expect(page.getByTestId(`board-${id}`)).toBeVisible();
		await expect(page.getByTestId(`board-${id}`).locator('.board-name')).toHaveText('Renamed');
	});

	test('delete forever purges a trashed board', async ({ page }) => {
		const id = await createBoard(page);
		await page.goto('/');

		await page.getByTestId(`board-menu-${id}`).click();
		await page.getByRole('menuitem', { name: 'Move to trash' }).click();
		await page.getByTestId('view-trash').click();
		await expect(page.getByTestId(`board-${id}`)).toBeVisible();

		await page.getByTestId(`board-menu-${id}`).click();
		await page.getByRole('menuitem', { name: 'Delete forever' }).click();
		await expect(page.getByTestId(`board-${id}`)).toHaveCount(0);

		await page.reload();
		await page.getByTestId('view-trash').click();
		await expect(page.getByTestId(`board-${id}`)).toHaveCount(0);
	});
});
