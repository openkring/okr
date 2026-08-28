/**
 * Deletes ONLY documents carrying a given `seedBatch` marker — the sibling of
 * scripts/seed-demo-tenant.mjs. Deletes by marker, never by tenant: `okr` already holds
 * real shared content (pages, sections, menuItems, categories) that pre-dates the demo
 * seed and that a tenant-scoped delete would destroy.
 *
 * Safety rails (non-negotiable, see task-B2-brief.md):
 *  1. Tenant lock — refuses to run unless the first argument is exactly `okr`.
 *  2. Marker required — the seedBatch marker is a mandatory second argument. No default,
 *     no "delete everything" path.
 *  3. `--dry-run` prints intended delete counts without deleting anything.
 *
 * Usage:
 *   node scripts/teardown-demo-tenant.mjs okr perf-demo-2026-08-28 --dry-run
 *   node scripts/teardown-demo-tenant.mjs okr perf-demo-2026-08-28
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TENANT = process.argv[2];
if (TENANT !== 'okr') {
  console.error(`Refusing to operate on tenant "${TENANT}". These scripts only ever touch tenant "okr".`);
  process.exit(1);
}

const MARKER = process.argv[3];
if (!MARKER || MARKER.startsWith('--')) {
  console.error('Usage: node scripts/teardown-demo-tenant.mjs okr <seedBatch> [--dry-run]');
  console.error('The seedBatch marker is required — there is no default and no "delete everything" path.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const COLLECTIONS = [
  'persons', 'addresses', 'avatars', 'orgs', 'groups', 'memberships',
  'tasks', 'calevents', 'invitations', 'activities', 'comments', 'resources',
];

async function deleteByMarker(collectionName) {
  let total = 0;
  for (;;) {
    const snap = await db.collection(collectionName).where('seedBatch', '==', MARKER).limit(400).get();
    if (snap.empty) break;
    total += snap.size;
    if (DRY_RUN) {
      // Dry-run: count without deleting. Since nothing is removed, re-querying the same
      // page would loop forever — break after the first page and report an estimated
      // total via a count() aggregation instead.
      const countSnap = await db.collection(collectionName).where('seedBatch', '==', MARKER).count().get();
      total = countSnap.data().count;
      break;
    }
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    console.log(`${collectionName}: deleted ${total} so far`);
  }
  return total;
}

console.log(`${DRY_RUN ? '[dry-run] ' : ''}Tearing down tenant "okr" documents with seedBatch "${MARKER}"`);
let grandTotal = 0;
for (const collectionName of COLLECTIONS) {
  const count = await deleteByMarker(collectionName);
  console.log(`${DRY_RUN ? '[dry-run] would delete' : 'deleted'} ${collectionName}: ${count}`);
  grandTotal += count;
}
console.log(`${DRY_RUN ? '[dry-run] ' : ''}Done. Total documents ${DRY_RUN ? 'that would be deleted' : 'deleted'}: ${grandTotal}`);
