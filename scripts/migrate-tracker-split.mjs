/**
 * ONE-OFF MIGRATION — the tracker split (owner decision 2026-11-26).
 *
 * The tracker («Strecke aufzeichnen», menu row `trip-tracker`, route `/tracker`) left the `trip` block (Logbuch)
 * and is now its own free block `tracker`. For every tenant whose `app-config/{tenantId}.enabledFeatures`
 * contains `trip`, add `tracker`, so the row and the route stay. Tenants without `enabledFeatures` (legacy
 * «all blocks») are untouched. No subscription option changes: `tracker` is in no paid option.
 *
 * The decision is `planTrackerSplit` (`libs/tenant/util/src/lib/tracker-split.util.ts`, unit-tested); this script
 * only reads and writes. Idempotent: a second run plans nothing.
 *
 * ORDER (binding): run this migration with `--apply` FIRST, then deploy functions, then release the apps.
 * The old client and old functions ignore the unknown block id, so running it early is safe. The reverse order is
 * not: a new client before the migration hides «Strecke aufzeichnen» for every Logbuch tenant, and a picker save
 * with new functions before the migration removes `trip-tracker` from `main_<tenantId>`.
 *
 * Writes use `FieldValue.arrayUnion`, so a concurrent picker save is never overwritten.
 *
 * Usage:
 *   node scripts/migrate-tracker-split.mjs                 # dry run (default): prints what would change
 *   node scripts/migrate-tracker-split.mjs --tenant=scs    # dry run, one tenant
 *   node scripts/migrate-tracker-split.mjs --apply         # writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createJiti } from 'jiti';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { planTrackerSplit } = await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/tracker-split.util.ts'));

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const TENANT = ARGS.find((a) => a.startsWith('--tenant='))?.slice('--tenant='.length);

const APP_CONFIG = 'app-config';

if (!getApps().length) initializeApp();
const db = getFirestore();

const configs = TENANT
  ? [await db.collection(APP_CONFIG).doc(TENANT).get()].filter((d) => d.exists)
  : (await db.collection(APP_CONFIG).get()).docs;

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — tracker split, ${configs.length} app-config doc(s)\n`);

let changed = 0;
for (const configDoc of configs) {
  const tenantId = configDoc.id;
  const enabled = configDoc.get('enabledFeatures');
  const plan = planTrackerSplit(enabled);
  if (plan.addBlocks.length === 0) {
    const why = !Array.isArray(enabled) ? 'legacy (no enabledFeatures)' : !enabled.includes('trip') ? 'no trip' : 'already split';
    console.log(`  ${tenantId}: unchanged — ${why}`);
    continue;
  }
  changed++;
  console.log(`  ${tenantId}: enabledFeatures += ${plan.addBlocks.join(', ')}`);
  if (!APPLY) continue;
  await db.collection(APP_CONFIG).doc(tenantId).update({ enabledFeatures: FieldValue.arrayUnion(...plan.addBlocks) });
  console.log(`  ${tenantId}: written`);
}

console.log(`\n${changed} tenant(s) ${APPLY ? 'migrated' : 'would change'}.${APPLY ? '' : ' Re-run with --apply to write.'}`);
