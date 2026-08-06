import { test, expect, chromium, type Page } from '@playwright/test';

/**
 * Feature-block toggle + route gate (plan 2026-08-01-feature-building-blocks, task 21).
 *
 * AUTH PATTERN: CDP connect to an already-running, already-logged-in Chrome — the same
 * pattern as `calendar.spec.ts`/`auth.spec.ts`, NOT the `chromium-auth` project. Two
 * reasons, both hard: (a) `e2e/.auth-state.json` does not exist in the repo, so that
 * project cannot start; (b) Firebase Auth persists its session in IndexedDB, which
 * Playwright's `storageState` does not capture — a saved storage state would start
 * signed out regardless. Start Chrome with:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *     --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-e2e
 * log in as a tenant admin, then: npx playwright test feature-toggle --project=chromium
 */

const BASE_URL = 'http://localhost:4201';

/**
 * `rootUrl` of the tenant the served app runs as — read from live Firestore
 * `app-config/scs` (2026-08-06) and matching `apps/scs-app/src/environments/environment.ts`
 * (`tenantId: 'scs'`), which is what `playwright.config.ts`'s webServer serves.
 * `isFeatureEnabledGuard` redirects here, never to a 404/403.
 */
const ROOT_URL = '/private/dashboard/c-contentpage';

/**
 * Two urls owned by blocks that are NOT in scs's `enabledFeatures`, each closing a
 * different half of the gate (urls read off `FEATURE_ROUTES`, `@okr/tenant-routes`):
 *  - `instruments` — availability `ga`, simply absent from scs's stored array, i.e. the
 *    enablement path this task is about.
 *  - `games` — `defaultAvailability: 'disabled'` (owner ruling 2026-08-04), i.e. the
 *    rollout path, which no tenant array can switch back on.
 * Neither test writes anything: both blocks are already off, so the tenant's
 * `enabledFeatures` is untouched and there is nothing to restore.
 */
const GATED_URLS = ['/instruments/all/c-instruments', '/quiz'];

/**
 * ⚠️ The toggle case below needs a tenant with an off block that OWNS a root menu entry —
 * scs has none: its only two off, offerable blocks (`instruments`, `vcard`) both declare
 * `menu: []` in `FEATURE_BLOCKS`, so no menu row could ever appear and the assertion would
 * be vacuous. `finance` (label "Finanzen & Buchhaltung", root menu doc `finance-menu`,
 * label `@main.finance.title` → "Finanzen") is off for `p13` and owns one, so run that case
 * against `pnpm nx serve p13-app --port 4201`. p13 rather than scs deliberately: lowest-stakes
 * of the two deployed tenants, and scs's hand-curated 26-entry root menu is the one a bad
 * save damages most.
 */
const TOGGLE_BLOCK_LABEL = /Finanzen & Buchhaltung/i;
const TOGGLE_MENU_LABEL = /Finanzen/i;
const PICKER_URL = '/tenant/features';

async function connectToChrome(): Promise<{ browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>, page: Page }> {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  await page.bringToFront();
  return { browser, page };
}

/** Clicks the picker's save button and clears the removal/dependents confirmation if one appears. */
async function saveSelection(page: Page): Promise<void> {
  await page.locator('okr-feature-picker ion-toolbar ion-buttons[slot="end"] ion-button').click();
  const confirm = page.locator('ion-alert button.alert-button').filter({ hasText: /^\s*(ok|okay)\s*$/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('ion-toast')).toBeVisible({ timeout: 30000 });
}

async function setBlock(page: Page, checked: boolean): Promise<void> {
  await page.goto(`${BASE_URL}${PICKER_URL}`);
  const row = page.locator('okr-feature-picker ion-item').filter({ hasText: TOGGLE_BLOCK_LABEL });
  await row.locator('ion-checkbox').setChecked(checked);
  await saveSelection(page);
}

test('feature picker: enabling a block adds its menu entry without a reload', async () => {
  const { browser, page } = await connectToChrome();
  let toggled = false;
  try {
    await page.goto(`${BASE_URL}${PICKER_URL}`);
    const picker = page.locator('okr-feature-picker');

    // NOT a soft assertion: `FeaturePicker` is routed from NOWHERE today — `FEATURE_ROUTES`
    // has no `tenant` entry (the domain is in `NON_BLOCK_DOMAINS`: "this domain — the
    // catalogue itself") and `app.routes.ts` is nothing but `composeGatedFeatureRoutes()`
    // plus the `**` catch-all, so this url renders `ErrorPage`. The case activates by itself
    // the day a route lands; until then it must not report a green it did not earn.
    test.skip(!await picker.isVisible().catch(() => false),
      `no route renders FeaturePicker (${PICKER_URL} falls through to the catch-all ErrorPage)`);

    const row = picker.locator('ion-item').filter({ hasText: TOGGLE_BLOCK_LABEL });
    test.skip(!await row.isVisible().catch(() => false),
      'block not offered to this tenant — serve p13-app (see TOGGLE_BLOCK_LABEL)');

    await row.locator('ion-checkbox').setChecked(true);
    await saveSelection(page);
    toggled = true;

    // No reload: the root menu is driven by AppStore's live `app-config` stream, so the new
    // entry must appear while the browser is still sitting on the picker url.
    await page.locator('ion-menu-button').first().click();
    await expect(page.locator('ion-menu ion-item').filter({ hasText: TOGGLE_MENU_LABEL }))
      .toBeVisible({ timeout: 30000 });
    await expect(page).toHaveURL(`${BASE_URL}${PICKER_URL}`);
  } finally {
    // Leave `enabledFeatures` exactly as found — a leaked toggle changes what a real tenant
    // can reach. Runs even when an assertion above threw.
    if (toggled) await setBlock(page, false);
    await browser.close(); // disconnect CDP without closing Chrome
  }
});

test('feature gate: a disabled block url redirects to the tenant rootUrl', async () => {
  const { browser, page } = await connectToChrome();
  try {
    for (const url of GATED_URLS) {
      await page.goto(`${BASE_URL}${url}`);
      await expect(page).toHaveURL(`${BASE_URL}${ROOT_URL}`, { timeout: 30000 });
    }
  } finally {
    await browser.close();
  }
});
