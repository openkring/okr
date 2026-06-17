// apps/functions/src/pdf/browser-pool.ts
// puppeteer-core + @sparticuz/chromium are imported dynamically (type-only at
// module scope) so they are NOT loaded at cold start. In Firebase gen2 every
// function loads this shared bundle; a top-level import would OOM low-memory
// functions (see H-1 deploy note).
//
// @sparticuz/chromium ships a serverless Linux Chromium binary inside the npm
// package, so it works without puppeteer's post-install Chrome download (which
// pnpm skips). puppeteer-core then launches that binary via executablePath.
import type { Browser } from 'puppeteer-core';
import * as logger from 'firebase-functions/logger';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser !== null) return browser;
  const { default: chromium } = await import('@sparticuz/chromium');
  const { default: puppeteer } = await import('puppeteer-core');
  logger.info('pdf/browser-pool: launching new Puppeteer browser');
  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  browser.on('disconnected', () => { browser = null; });
  return browser;
}
