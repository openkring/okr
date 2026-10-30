#!/usr/bin/env node
/**
 * Moves the hand-typed keywords of every icon from `icons.index` into `icons.searchFields`.
 *
 * Until 2026-10-30 the icon index was an editable keyword list, and `getIconIndex` prepended
 * name + type to it on every save — so `index` holds the name and type (often several times)
 * plus whatever keywords someone typed. The index is now generated as
 * `n:name t:type s:searchFields` (libs/cms/icon/util), and the keywords live in `searchFields`.
 * Run this BEFORE the AOC re-indexer on icons, otherwise the keywords are lost.
 *
 *   node scripts/backfill-icon-search-fields.mjs            dry run: list every planned value
 *   node scripts/backfill-icon-search-fields.mjs --write    write searchFields
 *
 * The keywords are the words of the old index minus the icon's name and type, lowercased, with
 * duplicates removed (first occurrence keeps its place). Only `searchFields` is written; the index
 * itself is left to the re-indexer. A doc that already has a non-empty `searchFields` is skipped,
 * so a second run changes nothing. Archived icons are included (all tenants, incl. 'system').
 * Uses Application Default Credentials against project bkaiser-org, like the other backfills.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const write = process.argv.slice(2).includes('--write');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

/** The keywords of an old index: without name, type, prefixes of the new format and duplicates. */
function extractSearchFields(icon) {
  const name = (icon.name ?? '').toLowerCase();
  const type = (icon.type ?? '').toLowerCase();
  const seen = new Set();
  const words = [];
  for (const raw of (icon.index ?? '').toLowerCase().split(/\s+/)) {
    const word = raw.replace(/^[a-z]{1,2}:/, ''); // tolerate an index already in n:/t:/s: form
    if (!word || word === name || word === type || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words.join(' ');
}

const snap = await db.collection('icons').get();
const planned = [];
let alreadySet = 0;
for (const d of snap.docs) {
  const icon = d.data();
  if ((icon.searchFields ?? '').trim().length > 0) { alreadySet++; continue; }
  const searchFields = extractSearchFields(icon);
  if (searchFields) planned.push({ ref: d.ref, id: d.id, icon, searchFields });
}

console.log(`${snap.size} icons, ${alreadySet} already have searchFields, ${planned.length} get keywords, `
  + `${snap.size - alreadySet - planned.length} have none (name/type only)`);
for (const p of planned) {
  console.log(`  ${p.icon.type}/${p.icon.name}  ${JSON.stringify(p.icon.index)}  ->  ${JSON.stringify(p.searchFields)}`);
}

if (!write) {
  if (planned.length) console.log('dry run — nothing written (run with --write)');
  process.exit(0);
}

let batch = db.batch();
let inBatch = 0;
let written = 0;
for (const p of planned) {
  batch.update(p.ref, { searchFields: p.searchFields });
  inBatch++;
  written++;
  if (inBatch === 400) {
    await batch.commit();
    batch = db.batch();
    inBatch = 0;
  }
}
if (inBatch > 0) await batch.commit();
console.log(`${written} icons: searchFields written`);
