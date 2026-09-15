/// <reference path="./pdfjs-worker-module.ts" />
import { groupTextItemsIntoLines } from '@okr/finance-bank-import-util';

/**
 * Reads a PDF into one text line per visual line, page by page, pages separated by a blank line
 * (spec §4.10; the grouping itself is `groupTextItemsIntoLines` in the util lib).
 *
 * `pdfjs-dist` (~400 KB) is loaded on first use through dynamic `import()`s so it never enters an
 * app's eager bundle (see the `lazy-loading` skill). The parser runs on the main thread: importing the
 * worker module registers `globalThis.pdfjsWorker`, which pdf.js picks up as its in-process worker —
 * a statement is a handful of text pages, so no Web Worker (and no worker URL to bundle) is needed.
 */
export async function extractPdfLines(data: ArrayBuffer): Promise<string> {
  const [pdfjs] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.mjs')]);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  try {
    const out: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.map(i => ('str' in i ? { str: i.str, transform: i.transform } : undefined)).filter(i => i !== undefined);
      out.push(...groupTextItemsIntoLines(items), '');
    }
    return out.join('\n');
  } finally {
    await doc.destroy();
  }
}
