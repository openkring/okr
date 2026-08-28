/**
 * ONE-TIME DATA FIX — adds tenant `okr` to the shared CMS documents that make up
 * the dashboard page, so the `okr` demo tenant can see the same dashboard as `scs`.
 *
 * Context (task B3, planning/.../2026-08-28-dashboard-performance-plan):
 * there is exactly one dashboard page in the whole database (`pages/dashboard`),
 * shared by up to six tenants (bka, p13, scs, bkg, elab, kring). Its five sections
 * (d-invitations, d-messages, d-events, d-tasks, d-news) and the context menu
 * `menuItems/c-contentpage` are likewise shared documents. `okr` is missing from
 * some of these `tenants` arrays.
 *
 * SAFETY: every document here is shared by other live tenants (scs is production).
 * This script ONLY appends 'okr' via FieldValue.arrayUnion — it never reads the
 * array and writes it back, and never uses `set`. A document whose `tenants`
 * array already contains 'okr' is left completely untouched (skipped, not
 * re-written). No other field on any document is touched.
 *
 * Usage:
 *   node scripts/enable-dashboard-for-tenant-okr.mjs              # dry run (default)
 *   node scripts/enable-dashboard-for-tenant-okr.mjs --dry-run    # dry run (explicit)
 *   node scripts/enable-dashboard-for-tenant-okr.mjs --apply      # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const TENANT = 'okr';

const DOCS = [
  { collection: 'pages', id: 'dashboard' },
  { collection: 'menuItems', id: 'c-contentpage' },
  { collection: 'sections', id: 'd-invitations' },
  { collection: 'sections', id: 'd-messages' },
  { collection: 'sections', id: 'd-events' },
  { collection: 'sections', id: 'd-tasks' },
  { collection: 'sections', id: 'd-news' },
];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const explicitDryRun = args.includes('--dry-run');
if (!apply && !explicitDryRun && args.length > 0 && !args.every((a) => a === '--dry-run' || a === '--apply')) {
  console.error('Usage: node scripts/enable-dashboard-for-tenant-okr.mjs [--dry-run|--apply]');
  process.exit(1);
}
const dryRun = !apply;

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

console.log(dryRun
  ? `DRY RUN (no writes) — pass --apply to actually append '${TENANT}'.\n`
  : `APPLY MODE — writes will be performed via FieldValue.arrayUnion('${TENANT}').\n`);

const toUpdate = [];

for (const { collection, id } of DOCS) {
  const ref = db.collection(collection).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`[MISSING] ${collection}/${id} does not exist — skipping.`);
    continue;
  }
  const data = snap.data();
  const tenantsBefore = Array.isArray(data.tenants) ? data.tenants : [];
  const hasTenant = tenantsBefore.includes(TENANT);
  console.log(`${collection}/${id}`);
  console.log(`  tenants (before): [${tenantsBefore.join(', ')}]`);
  if (hasTenant) {
    console.log(`  -> already contains '${TENANT}', no write needed.\n`);
    continue;
  }
  console.log(`  -> will append '${TENANT}' via arrayUnion (additive only).\n`);
  toUpdate.push({ ref, collection, id, tenantsBefore });
}

if (toUpdate.length === 0) {
  console.log('Nothing to do — all documents already contain the tenant.');
  process.exit(0);
}

console.log(`Documents to update: ${toUpdate.map((d) => `${d.collection}/${d.id}`).join(', ')}`);

if (dryRun) {
  console.log('\nDry run complete — no writes performed. Re-run with --apply to write.');
  process.exit(0);
}

for (const { ref, collection, id, tenantsBefore } of toUpdate) {
  await ref.update({ tenants: FieldValue.arrayUnion(TENANT) });
  const after = (await ref.get()).data();
  const tenantsAfter = after.tenants;
  const lostAny = tenantsBefore.some((t) => !tenantsAfter.includes(t));
  console.log(`${collection}/${id}`);
  console.log(`  tenants (after):  [${tenantsAfter.join(', ')}]`);
  console.log(`  pre-existing tenants preserved: ${lostAny ? 'NO — DATA LOSS!' : 'yes'}`);
  console.log(`  '${TENANT}' present: ${tenantsAfter.includes(TENANT) ? 'yes' : 'NO — FAILED'}\n`);
}

console.log('Done.');
