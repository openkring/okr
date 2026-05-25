// apps/functions/src/pdf/browser-pool.ts
import puppeteer, { Browser } from 'puppeteer';
import * as logger from 'firebase-functions/logger';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser;
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
