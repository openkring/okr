/**
 * Backfills `ocr-results.qrBill` (2026-09-28) for receipts extracted before the OCR pipeline
 * decoded Swiss QR-bills. New receipts get it from `extractReceipt` (apps/functions/src/ocr);
 * this is the same decode — imgix renders each page as JPEG, jpeg-js + jsQR read it — for the
 * documents that predate it. It does NOT re-run Gemini, bookings or tasks.
 *
 * The debtor block is blanked before writing (the debtor is the member who paid; ocr-results is
 * tenant-readable) — the same rule as `stripQrBillDebtor` in @okr/shared-util-core.
 *
 * Run with:  node scripts/backfill-ocr-qrbill.mjs --dry
 *            node scripts/backfill-ocr-qrbill.mjs
 *
 * Idempotent: only documents WITHOUT a `qrBill` field are read; a receipt without a bill gets
 * `qrBill: ''` so it is not fetched again.
 */
import { createRequire } from 'node:module';
import { argv } from 'node:process';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// jsqr and jpeg-js are dependencies of apps/functions, not of the repo root.
const require = createRequire(new URL('../apps/functions/package.json', import.meta.url));
const jsQR = require('jsqr');
const jpeg = require('jpeg-js');

const PROJECT_ID = 'bkaiser-org';
const IMGIX_BASE = 'https://bkaiser.imgix.net';
const DRY = argv.includes('--dry');
const MAX_PDF_PAGES = 30;
const WIDTHS = [1600, 2400];

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const isBill = (t) => { const l = t.split(/\r?\n/); return l[0] === 'SPC' && /^02\d\d$/.test(l[1] ?? '') && l[30] === 'EPD'; };
const stripDebtor = (t) => { const l = t.split(/\r?\n/); for (let i = 20; i <= 26 && i < l.length; i++) l[i] = ''; return l.join('\r\n'); };

async function pdfPageCount(path) {
  const res = await fetch(`${IMGIX_BASE}/${path}?fm=json`);
  if (!res.ok) throw new Error(`imgix ${res.status} (metadata)`);
  const count = Number((await res.json()).PDF?.PageCount ?? 1);
  return Number.isInteger(count) && count > 0 ? count : 1;
}

async function decodeAt(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`imgix ${res.status}`);
  const img = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true, maxMemoryUsageInMB: 512 });
  return jsQR(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height)?.data;
}

async function decode(storagePath) {
  const isPdf = /\.pdf$/i.test(storagePath);
  const path = storagePath.split('/').map(encodeURIComponent).join('/');
  // the QR-bill is almost always on the LAST page — scan back to front
  const pageCount = isPdf ? await pdfPageCount(path) : 1;
  for (let page = pageCount; page >= Math.max(1, pageCount - MAX_PDF_PAGES + 1); page--) {
    for (const w of WIDTHS) {
      const text = await decodeAt(`${IMGIX_BASE}/${path}?fm=jpg&q=95&w=${w}${isPdf ? `&page=${page}` : ''}`);
      if (text && isBill(text)) return stripDebtor(text);
      if (text) break;
    }
  }
  return '';
}

console.log(`backfill-ocr-qrbill${DRY ? ' (dry run)' : ''}`);
const snap = await db.collection('ocr-results').get();
let found = 0, empty = 0, failed = 0;
for (const doc of snap.docs) {
  const r = doc.data();
  if (r.qrBill !== undefined || !r.storagePath) continue;
  try {
    const qrBill = await decode(r.storagePath);
    if (qrBill) found++; else empty++;
    const l = qrBill.split('\r\n');
    console.log(`  ${qrBill ? 'QR ' : '-  '} ${r.storagePath}${qrBill ? `  → ${l[5]}, ${l[18]} ${l[19]}` : ''}`);
    if (!DRY) await doc.ref.update({ qrBill });
  } catch (e) {
    failed++;
    console.log(`  !   ${r.storagePath}: ${e.message} (left for a later run)`);
  }
}
console.log(`ocr-results: ${found} with QR-bill, ${empty} without, ${failed} failed, of ${snap.size}`);
