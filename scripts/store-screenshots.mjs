#!/usr/bin/env node
/**
 * Store screenshots for Google Play and the App Store (spec 1.10 Phase 3b).
 *
 *   STORE_LOGIN=<login> STORE_PASSWORD=<password> node scripts/store-screenshots.mjs scs-app [baseUrl]
 *
 * Logs in as the store-review user against a running build of the app (default
 * http://localhost:4299 — `pnpm nx serve <app> --port 4299`; the dev build passes App Check with the
 * debug token from the app's .env and renders the same UI as the store build) and renders each
 * screen at the exact store pixel sizes:
 *
 *   iPhone 6.9″  440×956 @3 = 1320×2868   → store/ios/screenshots/de-DE/   and Play phoneScreenshots
 *   iPad 13″    1032×1376 @2 = 2064×2752  → store/ios/screenshots/de-DE/   and Play tenInchScreenshots
 *
 * Credentials come ONLY from the environment — the review password is never persisted (skill
 * `authentication`). Output lands in the app's private submodule (`apps/<app>/store/`), in the
 * layouts fastlane `deliver` and `supply` read.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [app, baseUrl = 'http://localhost:4299'] = process.argv.slice(2);
const login = process.env.STORE_LOGIN;
const password = process.env.STORE_PASSWORD;
if (!app || !login || !password) {
  console.error('usage: STORE_LOGIN=… STORE_PASSWORD=… node scripts/store-screenshots.mjs <app> [baseUrl]');
  process.exit(1);
}

/** The screens, in store order. Keep them reachable for an ordinary member (the review user). */
// `waitFor`: text that proves the screen has loaded (the start page shows a splash first).
// `scrollTo`: text to scroll into view before the shot (e.g. one article on a long news page).
const SCREENS = [
  { name: 'dashboard', url: '/private/dashboard/c-contentpage', waitFor: 'Nächste Anlässe' },
  { name: 'kalender', url: '/calevent/my/c-calevents' },
  { name: 'chat', url: '/private/chat/contextMenuChat' },
  { name: 'news', url: '/private/news_scs/c-contentpage', scrollTo: 'Schweizer Doppelvierer schreibt Geschichte' },
  { name: 'album', url: '/album/scs-album/c-album?folder=scs_20260105scsNeujahrsfahrt' },
  { name: 'kontakt', url: '/private/scs_contact/c-contentpage' },
];

const DEVICES = [
  { id: 'iphone', viewport: { width: 440, height: 956 }, scale: 3, isMobile: true,
    play: 'phoneScreenshots' },
  { id: 'ipad', viewport: { width: 1032, height: 1376 }, scale: 2, isMobile: true,
    play: 'tenInchScreenshots' },
];

const store = path.join(ROOT, 'apps', app, 'store');
const iosDir = path.join(store, 'ios', 'screenshots', 'de-DE');
fs.mkdirSync(iosDir, { recursive: true });

const browser = await chromium.launch();
try {
  for (const device of DEVICES) {
    const context = await browser.newContext({
      viewport: device.viewport, deviceScaleFactor: device.scale, isMobile: device.isMobile,
      hasTouch: true, locale: 'de-CH',
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/auth/login`);
    await page.getByText('Nur notwendige', { exact: true }).click({ timeout: 15000 }).catch(() => {});
    await page.locator('input[name="loginEmail"]').fill(login);
    await page.locator('input[name="loginPassword"]').fill(password);
    await page.getByText('Anmelden', { exact: true }).last().click();
    await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 60000 });

    const playDir = path.join(store, 'android', 'de-DE', 'images', device.play);
    fs.mkdirSync(playDir, { recursive: true });
    for (const [i, screen] of SCREENS.entries()) {
      if (screen.url) await page.goto(`${baseUrl}${screen.url}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      if (screen.waitFor) await page.getByText(screen.waitFor).first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(5000); // lists, avatars, map tiles
      if (screen.scrollTo) {
        await page.getByText(screen.scrollTo).first().scrollIntoViewIfNeeded({ timeout: 15000 });
        await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // images below the fold
      }
      const file = `${String(i + 1).padStart(2, '0')}_${screen.name}`;
      const buf = await page.screenshot({ type: 'png' });
      fs.writeFileSync(path.join(iosDir, `${file}_${device.id}.png`), buf);
      fs.writeFileSync(path.join(playDir, `${file}.png`), buf);
      console.log(`${device.id.padEnd(6)} ${file}  ${device.viewport.width * device.scale}×${device.viewport.height * device.scale}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
