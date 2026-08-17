/**
 * One-time (and idempotent) rebuild of the `stats_rollup` collection.
 *
 * WHY: the client used to open one Firestore listener per boat/person to render the trip-stats
 * ranking. It now reads a single document per (entityType, year) instead. `onTripWrite` keeps
 * those documents current and `onTripStatsReconcile` rewrites the CURRENT year nightly — but
 * nobody ever writes the past years, so they need this backfill once.
 *
 * WHAT: scans every trip, aggregates km + count per boat and per person per year, and writes
 * `stats_rollup/<boats|members>_<year>`. Full overwrite — safe to re-run.
 *
 * AUTHORITATIVE LOGIC: onTripStatsReconcile (apps/functions/src/trip/index.ts) — keep the
 * counting states and the entry shape in sync.
 *
 * Run with:  node scripts/rebuild-trip-stats-rollup.mjs --dry     (inspect first)
 *            node scripts/rebuild-trip-stats-rollup.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');
const COUNTING_STATES = new Set(['closed', 'closed.rev', 'deleted.corr', 'deleted.corr.rev']);

/** `${entityType}_${year}` → { [entityKey]: { km, count } } */
const rollups = new Map();

function add(entityType, year, key, km) {
  const docId = `${entityType}_${year}`;
  const entries = rollups.get(docId) ?? {};
  const cur = entries[key] ?? { km: 0, count: 0 };
  entries[key] = { km: cur.km + km, count: cur.count + 1 };
  rollups.set(docId, entries);
}

const snap = await db.collection('trips').get();
let counted = 0;

for (const doc of snap.docs) {
  const t = doc.data();
  if (!COUNTING_STATES.has(t.state)) continue;

  const year = String(t.startDate ?? '').substring(0, 4);
  if (!/^\d{4}$/.test(year) || year === '0000') continue;

  const km = Number(t.distance);
  if (!Number.isFinite(km)) continue;

  if (t.resource?.key) add('boats', year, t.resource.key, km);
  for (const p of t.participants ?? []) {
    if (p.key) add('members', year, p.key, km);
  }
  counted++;
}

console.log(`scanned ${snap.size} trips, counted ${counted}, ${rollups.size} rollup doc(s)`);
for (const [docId, entries] of [...rollups].sort()) {
  const totalKm = Object.values(entries).reduce((s, e) => s + e.km, 0);
  console.log(`  ${docId}: ${Object.keys(entries).length} entries, ${Math.round(totalKm)} km`);
}

if (DRY_RUN) {
  console.log('dry run — nothing written');
} else {
  const batch = db.batch();
  for (const [docId, entries] of rollups) {
    batch.set(db.doc(`stats_rollup/${docId}`), { entries, updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  console.log(`wrote ${rollups.size} rollup doc(s)`);
}
