#!/usr/bin/env node
/**
 * Rebuilds `icons.index` for every icon as `n:name t:type s:searchFields` — the same string
 * `IconService` writes on create/update (`getIconIndex` in libs/cms/icon/util). This is the AOC
 * re-indexer for icons, runnable before that UI ships. Run scripts/backfill-icon-search-fields.mjs
 * first, otherwise the hand-typed keywords of the old index are lost.
 *
 *   node scripts/reindex-icons.mjs            dry run: report the docs whose index differs
 *   node scripts/reindex-icons.mjs --write    rewrite those indexes
 *
 * Only docs whose index differs are written, so a second run changes nothing. Archived icons are
 * included (all tenants, incl. 'system'). Uses Application Default Credentials against project
 * bkaiser-org, like the other backfills.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const write = process.argv.slice(2).includes('--write');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

/** Mirror of addIndexElement (libs/shared/util-core/src/lib/base-model.util.ts). Keep in sync. */
function addIndexElement(index, key, value) {
  if (value.length === 0 || value === ' ') return index;
  return index.length === 0 ? `${key}:${value}` : `${index} ${key}:${value}`;
}

/** Mirror of getIconIndex (libs/cms/icon/util/src/lib/icon.util.ts). Keep in sync. */
function getIconIndex(icon) {
  let index = '';
  index = addIndexElement(index, 'n', icon.name ?? '');
  index = addIndexElement(index, 't', icon.type ?? '');
  index = addIndexElement(index, 's', icon.searchFields ?? '');
  return index;
}

const snap = await db.collection('icons').get();
const diffs = snap.docs
  .map((d) => ({ ref: d.ref, icon: d.data(), index: getIconIndex(d.data()) }))
  .filter((p) => p.index !== (p.icon.index ?? ''));
console.log(`${snap.size} icons, ${diffs.length} with a differing index`);

if (!write) {
  for (const p of diffs.slice(0, 10)) console.log(`  ${JSON.stringify(p.icon.index)}  ->  ${JSON.stringify(p.index)}`);
  if (diffs.length > 10) console.log(`  … and ${diffs.length - 10} more (run with --write)`);
  process.exit(0);
}

let batch = db.batch();
let inBatch = 0;
let written = 0;
for (const p of diffs) {
  batch.update(p.ref, { index: p.index });
  inBatch++;
  written++;
  if (inBatch === 400) {
    await batch.commit();
    batch = db.batch();
    inBatch = 0;
  }
}
if (inBatch > 0) await batch.commit();
console.log(`${written} icon indexes written`);
