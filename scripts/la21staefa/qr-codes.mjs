#!/usr/bin/env node
/**
 * The donation QR codes (TWINT, PostFinance) of the la21staefa project pages at 150 × 150 px (2026-11-21).
 *
 *   node scripts/la21staefa/qr-codes.mjs           # dry run: lists the sections it would change
 *   node scripts/la21staefa/qr-codes.mjs --write
 *
 * Every article on a project page (`*_content`, nested accordion sections included) whose pictures are QR codes
 * gets `imageStyle.width/height = '150px'`; the website draws each picture of the side-by-side row as a square of
 * that size (section-mapper: imageHeight on an `imageRow`). A section counts when all of its pictures are QR
 * codes (file name, alt text or caption naming «QR» or «TWINT»). Idempotent.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';
export const QR_SIZE = '150px';

export const isQrImage = (img) => /qr|twint/i.test(`${img?.url ?? ''} ${img?.altText ?? ''} ${img?.overlay ?? ''}`);

/** a section whose pictures are all QR codes */
export function isQrSection(s) {
  const images = s?.properties?.images ?? [];
  return s?.type === 'article' && images.length > 0 && images.every(isQrImage);
}

async function main() {
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();

  const pages = (await db.collection('pages').where('tenants', 'array-contains', T).get()).docs
    .filter((d) => d.id.endsWith('_content'));
  const keys = new Set();
  for (const page of pages) {
    for (const key of page.data().sections ?? []) {
      const s = (await db.doc(`sections/${key}`).get()).data();
      if (!s) continue;
      keys.add(key);
      if (s.type === 'accordion') for (const it of s.properties?.items ?? []) if (it.key) keys.add(it.key);
    }
  }
  const batch = db.batch();
  let n = 0;
  for (const key of keys) {
    const s = (await db.doc(`sections/${key}`).get()).data();
    if (!isQrSection(s)) continue;
    const style = s.properties.imageStyle ?? {};
    const done = style.width === QR_SIZE && style.height === QR_SIZE;
    console.log(`${key}: ${s.properties.images.length} QR${done ? ' · already 150 px' : ''}`);
    if (done) continue;
    batch.update(db.doc(`sections/${key}`), { 'properties.imageStyle': { ...style, width: QR_SIZE, height: QR_SIZE } });
    n++;
  }
  if (!write) { console.log(`\nDry run — ${n} sections would change. Pass --write.`); return; }
  if (n) await batch.commit();
  console.log(`\nWritten: ${n} sections.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
