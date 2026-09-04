#!/usr/bin/env node
/**
 * Backfills `locations.index` for one tenant.
 *
 * `seed-diary-locations.mjs` (spec 1.34 V4) created the tenant's locations with `index: ''`.
 * Every list that searches locations — the location picker included — filters with
 * `nameMatches(location.index, searchTerm)`, so a typed term matched nothing. The index is the
 * same string `LocationService` writes on create/update (`getLocationIndex` in
 * libs/geo/location/util): `'n:' + name + ' w:' + what3words`. The builder is copied here rather
 * than imported because this is a plain node script, like the seed scripts beside it.
 *
 *   node scripts/backfill-location-index.mjs <tenantId>            dry run: report only
 *   node scripts/backfill-location-index.mjs <tenantId> --write    write the missing indexes
 *
 * Only documents whose `index` is empty are touched; an existing index is never overwritten.
 * Uses Application Default Credentials against project bkaiser-org, exactly like the seed scripts.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [tenantId, ...flags] = process.argv.slice(2);
if (!tenantId) {
  console.error('usage: node scripts/backfill-location-index.mjs <tenantId> [--write]');
  process.exit(2);
}
const write = flags.includes('--write');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

/** Mirror of getLocationIndex (libs/geo/location/util/src/lib/location.util.ts). Keep in sync. */
function getLocationIndex(location) {
  return 'n:' + (location.name ?? '') + ' w:' + (location.what3words ?? '');
}

const snap = await db.collection('locations').where('tenants', 'array-contains', tenantId).get();
const missing = snap.docs.filter((d) => !(d.data().index ?? '').length);
console.log(`${tenantId}: ${snap.size} locations, ${missing.length} without index`);

if (!write) {
  for (const d of missing.slice(0, 5)) console.log(`  would set ${d.id}: ${JSON.stringify(getLocationIndex(d.data()))}`);
  if (missing.length > 5) console.log(`  … and ${missing.length - 5} more (run with --write)`);
  process.exit(0);
}

let batch = db.batch();
let inBatch = 0;
let written = 0;
for (const d of missing) {
  batch.update(d.ref, { index: getLocationIndex(d.data()) });
  inBatch++;
  written++;
  if (inBatch === 400) {
    await batch.commit();
    batch = db.batch();
    inBatch = 0;
  }
}
if (inBatch > 0) await batch.commit();
console.log(`${tenantId}: ${written} indexes written`);
