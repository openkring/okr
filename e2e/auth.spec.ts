import { test, expect, chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:4201';

// ── Logout test ─────────────────────────────────────────────────────────────
// Requires Chrome started with remote debugging:
//   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//     --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-e2e
// Then log in manually in that browser, then run:
//   npx playwright test e2e/auth.spec.ts --grep logout --project=chromium

test('logout', async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  try {
    const context = browser.contexts()[0];
    const page    = context.pages()[0] ?? await context.newPage();

    await page.goto(`${BASE_URL}/private/dashboard/c-contentpage`);
    await expect(page).toHaveURL(/\/private\/dashboard/, { timeout: 10000 });

    const menuButton = page.locator('ion-menu-button').first();
    await menuButton.click();

    const logoutItem = page.locator('ion-item, bk-multi-avatar').filter({ hasText: /logout|abmelden/i });
    await logoutItem.waitFor({ timeout: 5000 });
    await logoutItem.click();

    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 });
  } finally {
    // Disconnect from the external browser without closing Chrome
    await browser.close();
  }
});
