import { test, expect } from '@playwright/test';
import { canvasBox, createBoard } from './helpers';

function activeInfo(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const el = document.activeElement as HTMLElement | null;
		return {
			role: el?.getAttribute('role') ?? null,
			label: el?.getAttribute('aria-label') ?? el?.textContent?.trim().slice(0, 40) ?? null
		};
	});
}

test.describe('M4-07 — keyboard navigation and a11y', () => {
	test('context menu: focus enters, arrows move, Escape closes', async ({ page }) => {
		await createBoard(page);
		const box = await canvasBox(page);
		await page.mouse.click(box.x + 700, box.y + 500, { button: 'right' });
		const menu = page.getByRole('menu');
		await expect(menu).toBeVisible();

		const first = await activeInfo(page);
		expect(first.role).toBe('menuitem');

		await page.keyboard.press('ArrowDown');
		const second = await activeInfo(page);
		expect(second.role).toBe('menuitem');
		expect(second.label).not.toBe(first.label);

		await page.keyboard.press('ArrowUp');
		expect((await activeInfo(page)).label).toBe(first.label);

		await page.keyboard.press('Escape');
		await expect(menu).toHaveCount(0);
	});

	test('command palette: arrows change the active option and Escape closes', async ({ page }) => {
		await createBoard(page);
		await page.keyboard.press('Control+k');
		const dialog = page.getByRole('dialog', { name: 'Command palette' });
		await expect(dialog).toBeVisible();

		const input = dialog.locator('input[role="combobox"]');
		await expect(input).toBeFocused();
		await input.fill('tool');
		const options = dialog.getByRole('option');
		await expect(options.first()).toBeVisible();

		const firstActive = await input.getAttribute('aria-activedescendant');
		await page.keyboard.press('ArrowDown');
		const secondActive = await input.getAttribute('aria-activedescendant');
		expect(secondActive).toBeTruthy();
		expect(secondActive).not.toBe(firstActive);

		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
	});

	test('settings dialog takes focus, keeps Tab inside and closes with Escape', async ({ page }) => {
		await createBoard(page);
		await page.getByLabel('Settings').click();
		const panel = page.getByRole('dialog', { name: 'Settings' });
		await expect(panel).toBeVisible();
		await expect(panel).toHaveAttribute('aria-modal', 'true');
		await expect
			.poll(() =>
				page.evaluate(
					() => document.activeElement === document.querySelector('[role="dialog"][aria-labelledby="sp-title"]')
				)
			)
			.toBe(true);

		await page.keyboard.press('Tab');
		await expect
			.poll(() =>
				page.evaluate(() => {
					const active = document.activeElement as HTMLElement | null;
					const dialog = document.querySelector('[role="dialog"][aria-labelledby="sp-title"]');
					return !!active && !!dialog && dialog.contains(active);
				})
			)
			.toBe(true);

		await page.keyboard.press('Escape');
		await expect(panel).toHaveCount(0);
	});

	test('empty board shows the three onboarding hints', async ({ page }) => {
		await createBoard(page);
		const onboarding = page.getByTestId('canvas-onboarding');
		await expect(onboarding).toBeVisible();
		await expect(onboarding).toContainText('Draw with the pen');
		await expect(onboarding).toContainText('See all shortcuts');
		await expect(onboarding).toContainText('Add text, shapes, stickies or images');
	});

	test('prefers-reduced-motion disables UI animations', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await createBoard(page);
		await page.getByTestId('export').click();
		const seconds = await page.evaluate(() => {
			const menu = document.querySelector('.export-menu');
			if (!menu) return -1;
			const raw = getComputedStyle(menu).animationDuration;
			return raw.endsWith('ms') ? parseFloat(raw) / 1000 : parseFloat(raw);
		});
		expect(seconds).toBeGreaterThanOrEqual(0);
		expect(seconds).toBeLessThanOrEqual(0.001);
	});
});
