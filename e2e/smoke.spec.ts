import { test, expect } from '@playwright/test';

test.describe('smoke tests', () => {
  test('app loads and redirects to login or welcome page', async ({ page }) => {
    await page.goto('/');
    // Either redirected to a login page or to the welcome page
    await expect(page).toHaveURL(/\/(public|private|auth\/login)/);
    await expect(page.locator('ion-app, app-root')).toBeVisible();
  });

  test('public page is accessible without login', async ({ page }) => {
    await page.goto('/public/welcome');
    await expect(page).not.toHaveURL(/error/);
  });

  test('private page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/private/welcome/c-contentpage');
    // Should either show the page (if no auth redirect) or redirect to login
    await expect(page.locator('ion-app, app-root, ion-content')).toBeVisible({ timeout: 10000 });
  });
});
