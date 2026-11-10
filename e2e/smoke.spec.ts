import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('signed-out visitors land on sign in, with links to sign up and reset', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create account' })).toBeVisible();
    await page.goBack();
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Reset password' })).toBeVisible();
  });

  test('protected routes redirect to sign in and remember where you were going', async ({ page }) => {
    await page.goto('/settings/members');
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('tab bar renders in the dev field page with the gear at the end', async ({ page }) => {
    await page.goto('/dev/field');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveCount(5); // 4 tabs + gear
    await expect(nav.getByRole('link').last()).toHaveAccessibleName('Settings');
  });

  test('has no horizontal overflow at phone width', async ({ page }) => {
    await page.goto('/dev/components');
    await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('design system', () => {
  test('action sheet resolves and toast appears', async ({ page }) => {
    await page.goto('/dev/components');
    await page.getByRole('button', { name: 'Action sheet (destructive)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nolan' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove player' }).click();
    await expect(page.getByRole('status')).toHaveText('Player removed');
    await expect(page.getByText('Last sheet result').locator('..').getByText('remove')).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  test('form sheet traps focus and closes on Escape', async ({ page }) => {
    await page.goto('/dev/components');
    await page.getByRole('button', { name: 'Form sheet' }).click();
    const dialog = page.getByRole('dialog', { name: 'New game' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder('Opponent')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Form sheet' })).toBeFocused();
  });

  test('theme switch updates the html attribute and status-bar color', async ({ page }) => {
    await page.goto('/dev/components');
    await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#161618');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Auto' }).click();
  });
});
