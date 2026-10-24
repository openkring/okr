#!/usr/bin/env node
/**
 * Backfills `DiaryModel.albumKeys` on every diary entry of one tenant (spec 1.114 §2.2).
 *
 * SAFETY
 *   --dry-run is the DEFAULT. `--write` must be explicit.
 *   `--tenant=<id>` is mandatory and VALIDATED against `app-config/<id>`.
 *   Only docs whose stored `albumKeys` differ from the computed ones are updated, with
 *   `update({ albumKeys })` (no other field is touched), in batches of 400.
 *   Prints counts only: never titles, person names or diary text.
 *
 * `diaryAlbumKeys` is re-implemented from libs/content/diary/util/src/lib/diary-album.util.ts
 * (a plain node script cannot resolve '@okr/*'). Keep the two identical.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';
const isWrite = args.includes('--write');
const tenantId = flag('tenant');

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}
if (!tenantId) fail('--tenant=<id> is mandatory.');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const DiaryCollection = 'diaries';
const APP_CONFIG = 'app-config';

const config = await db.collection(APP_CONFIG).doc(tenantId).get();
if (!config.exists) fail(`Tenant '${tenantId}' has no ${APP_CONFIG} document.`);

const SLUG_SHAPE = /^[A-Za-z0-9_-]+$/;

/** Mirror of diaryAlbumKeys in diary-album.util.ts (reads `locations[]` since spec 1.117 — run it only after
 * scripts/migrate-diary-locations.mjs, which also recomputes albumKeys). */
function diaryAlbumKeys(diary) {
  const keys = new Set();
  for (const person of diary.people ?? []) {
    if (person?.key) keys.add(`person.${person.key}`);
  }
  for (const location of diary.locations ?? []) {
    if (location?.key) keys.add(`location.${location.key}`);
  }
  for (const event of diary.events ?? []) {
    // Jass result lines live in events[] on purpose (spec 1.77) and are not event slugs. The util skips
    // them via parseJassDiaryLine (diary-jass.util.ts); a Jass line always contains spaces, ':' and '·',
    // so the slug-shape test (same as seed-diary-event-albums.mjs) excludes exactly those.
    if (event && SLUG_SHAPE.test(event)) keys.add(`event.${event}`);
  }
  for (const tag of (diary.tags ?? '').split(',')) {
    const trimmed = tag.trim();
    if (trimmed) keys.add(`tag.${trimmed}`);
  }
  return [...keys].sort();
}

const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);

const snap = await db.collection(DiaryCollection).where('tenants', 'array-contains', tenantId).get();
let unchanged = 0;
let withKeys = 0;
const toUpdate = [];
for (const doc of snap.docs) {
  const data = doc.data();
  const keys = diaryAlbumKeys(data);
  if (keys.length > 0) withKeys++;
  // Exact match incl. order: an unsorted or missing stored array counts as different.
  if (same(data.albumKeys, keys)) unchanged++;
  else toUpdate.push({ ref: doc.ref, keys });
}

console.log(`tenant=${tenantId} scanned=${snap.size} unchanged=${unchanged} toUpdate=${toUpdate.length} `
  + `(entries with at least one key: ${withKeys})`);

if (!isWrite) {
  console.log('dry run, nothing written. Pass --write to apply.');
  process.exit(0);
}

let written = 0;
for (let i = 0; i < toUpdate.length; i += 400) {
  const batch = db.batch();
  for (const { ref, keys } of toUpdate.slice(i, i + 400)) batch.update(ref, { albumKeys: keys });
  await batch.commit();
  written += Math.min(400, toUpdate.length - i);
  console.log(`written ${written}/${toUpdate.length}`);
}
process.exit(0);
