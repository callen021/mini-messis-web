import { expect, test } from '@playwright/test';

test.describe('dev field page (sports engine)', () => {
  test('renders every soccer formation with placed jerseys and loaded artwork', async ({ page }) => {
    await page.goto('/dev/field');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Soccer field');
    const cards = page.locator('.qcard');
    await expect(cards).toHaveCount(8); // SOCCER_SHAPES[6]: eight shapes for 7v7 with GK
    const first = cards.first();
    await expect(first.locator('.shirt')).toHaveCount(7);
    await expect(first.locator('.standing')).toHaveCount(2);
    const img = first.locator('img.pitch');
    await expect(img).toHaveAttribute('src', /fields\/soccer-persp\.webp$/);
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 10_000 })
      .toBe(1200);
    // sample fill puts a name and number on every jersey
    await expect(first.locator('.shirt.open')).toHaveCount(0);
    await expect(first.locator('.shirt.hasnum')).toHaveCount(7);
  });

  test('switching sport, size and view updates the cards', async ({ page }) => {
    await page.goto('/dev/field');
    await page.getByLabel('Sport').selectOption('baseball');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Baseball diamond');
    await expect(page.locator('html')).toHaveAttribute('data-sport', 'baseball');
    await expect(page.locator('.qcard').first().locator('.shirt')).toHaveCount(9);
    await expect(page.locator('.qcard').first().locator('.standing')).toHaveCount(0);
    await page.getByRole('button', { name: /Increase Players/ }).click();
    await expect(page.locator('.qcard').first().locator('.shirt')).toHaveCount(10);
    await page.getByRole('radio', { name: 'Top-down' }).click();
    await expect(page.locator('.qcard').first().locator('img.pitch')).toHaveAttribute(
      'src',
      /fields\/baseball-flat\.webp$/,
    );
    await expect(page.locator('.qcard').first().locator('.stage')).toHaveClass(/flat/);
    // reset shared UI state for other tests
    await page.getByRole('radio', { name: '3D' }).click();
    await page.getByLabel('Sport').selectOption('soccer');
  });

  test('Auto-fill fill marks every jersey as auto-picked and leaves nobody open', async ({ page }) => {
    await page.goto('/dev/field');
    await page.getByRole('radio', { name: 'Auto-fill' }).click();
    const first = page.locator('.qcard').first();
    await expect(first.locator('.shirt.auto')).toHaveCount(7);
    await expect(first.locator('.autobadge')).toHaveCount(7);
    await page.getByRole('radio', { name: 'Open' }).click();
    await expect(first.locator('.shirt.open')).toHaveCount(7);
    await expect(first.locator('.openpill')).toHaveText('7 open');
    await page.getByRole('radio', { name: 'Sample' }).click();
  });
});
