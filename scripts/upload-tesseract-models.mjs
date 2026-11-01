#!/usr/bin/env node
// Upload the Tesseract language models for the Übersetzer's live view (idea 2.126 phase 2) into the
// default Storage bucket, where imgix serves them to tesseract.js:
//   gs://bkaiser-org.appspot.com/tesseract/4.0.0_best_int/<model>.traineddata.gz
//   → https://bkaiser.imgix.net/tesseract/4.0.0_best_int/<model>.traineddata.gz
//
// Source: the `@tesseract.js-data/<model>` npm packages on jsDelivr (Apache-2.0, from tessdata_best,
// integer-quantised — about 1–5 MB each). The model list is read from TESSERACT_MODELS in
// libs/instruments/translator/util/src/lib/translator-ocr-lang.ts, so the app and the bucket agree.
//
// Usage (needs application default credentials with write access to the bucket):
//   node scripts/upload-tesseract-models.mjs            # every model, skips those already uploaded
//   node scripts/upload-tesseract-models.mjs deu eng    # just these
//   node scripts/upload-tesseract-models.mjs --force    # re-upload even if present

import { readFileSync } from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const BUCKET = 'bkaiser-org.appspot.com';
const VARIANT = '4.0.0_best_int';
const PREFIX = `tesseract/${VARIANT}`;
const MAP_FILE = new URL('../libs/instruments/translator/util/src/lib/translator-ocr-lang.ts', import.meta.url);

function allModels() {
  const src = readFileSync(MAP_FILE, 'utf8');
  const body = src.slice(src.indexOf('TESSERACT_MODELS'), src.indexOf('};'));
  return [...new Set([...body.matchAll(/:\s*'([a-z_]+)'/g)].map(m => m[1]))].sort();
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const names = args.filter(a => !a.startsWith('--'));
const models = names.length ? names : allModels();

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: BUCKET });
const bucket = getStorage().bucket();

let uploaded = 0;
let skipped = 0;
const failed = [];
for (const model of models) {
  const file = bucket.file(`${PREFIX}/${model}.traineddata.gz`);
  if (!force && (await file.exists())[0]) {
    skipped++;
    continue;
  }
  const url = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${model}/${VARIANT}/${model}.traineddata.gz`;
  const res = await fetch(url);
  if (!res.ok) {
    failed.push(`${model} (${res.status})`);
    continue;
  }
  const data = Buffer.from(await res.arrayBuffer());
  // gzip magic bytes: a CDN error page must never land in the bucket under a model's name
  if (data[0] !== 0x1f || data[1] !== 0x8b) {
    failed.push(`${model} (not gzip)`);
    continue;
  }
  await file.save(data, {
    contentType: 'application/octet-stream',
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    resumable: false,
  });
  uploaded++;
  console.log(`✓ ${model} (${(data.length / 1e6).toFixed(1)} MB)`);
}

console.log(`\n${uploaded} uploaded, ${skipped} already there, ${failed.length} failed`);
if (failed.length) {
  console.log('failed:', failed.join(', '));
  process.exit(1);
}
