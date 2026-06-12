// apps/functions/src/pdf/browser-pool.ts
// puppeteer is imported dynamically (type-only at module scope) so it is NOT
// loaded at cold start. In Firebase gen2 every function loads this shared bundle;
// a top-level puppeteer import would OOM low-memory functions (see H-1 deploy note).
import type { Browser } from 'puppeteer';
import * as logger from 'firebase-functions/logger';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser !== null) return browser;
  const { default: puppeteer } = await import('puppeteer');
  logger.info('pdf/browser-pool: launching new Puppeteer browser');
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  browser.on('disconnected', () => { browser = null; });
  return browser;
}
