/**
 * ONE-OFF MIGRATION — the finance split (owner decision 2026-11-10, plan 2 Task 7b).
 *
 * The `finance` feature block was split into `finance` (Buchhaltung), `cost-accounting` (Kostenrechnung),
 * `expense` (Spesen/OCR) and `asset` (Anlagen). Owner ruling: keep everything. For every tenant whose
 * `app-config/{tenantId}.enabledFeatures` contains `finance`:
 *   - add `cost-accounting`, `expense`, `asset` to `enabledFeatures`;
 *   - if `subscriptions/{tenantId}.billing === 'stripe'`, also add `kostenrechnung`, `spesen-ocr`, `anlagen`
 *     to `subscriptions/{tenantId}.options` (billed from the next run).
 * Tenants without `enabledFeatures` (legacy «all blocks») are untouched.
 *
 * The decision is `planFinanceSplit` (`libs/tenant/util/src/lib/finance-split.util.ts`, unit-tested); this
 * script only reads and writes. Idempotent: a second run plans nothing.
 *
 * Run it AFTER the functions deploy that ships the split catalogue (`applyFeatureSelection` and every
 * function importing FEATURE_BLOCKS) — an older function would not know the three new block ids.
 *
 * Usage:
 *   node scripts/migrate-finance-split.mjs                 # dry run (default): prints what would change
 *   node scripts/migrate-finance-split.mjs --tenant=scs    # dry run, one tenant
 *   node scripts/migrate-finance-split.mjs --apply         # writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createJiti } from 'jiti';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { planFinanceSplit } = await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/finance-split.util.ts'));

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const TENANT = ARGS.find((a) => a.startsWith('--tenant='))?.slice('--tenant='.length);

const APP_CONFIG = 'app-config';
const SUBSCRIPTIONS = 'subscriptions';

if (!getApps().length) initializeApp();
const db = getFirestore();

const configs = TENANT
  ? [await db.collection(APP_CONFIG).doc(TENANT).get()].filter((d) => d.exists)
  : (await db.collection(APP_CONFIG).get()).docs;

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — finance split, ${configs.length} app-config doc(s)\n`);

let changed = 0;
for (const configDoc of configs) {
  const tenantId = configDoc.id;
  const config = configDoc.data() ?? {};
  const subSnap = await db.collection(SUBSCRIPTIONS).doc(tenantId).get();
  const sub = subSnap.exists ? subSnap.data() ?? {} : {};

  const plan = planFinanceSplit({ enabledFeatures: config.enabledFeatures, billing: sub.billing, options: sub.options });
  if (plan.addBlocks.length === 0 && plan.addOptions.length === 0) {
    const why = !Array.isArray(config.enabledFeatures) ? 'legacy (no enabledFeatures)'
      : !config.enabledFeatures.includes('finance') ? 'no finance' : 'already split';
    console.log(`  ${tenantId}: unchanged — ${why}`);
    continue;
  }
  changed++;
  if (plan.addBlocks.length > 0) console.log(`  ${tenantId}: enabledFeatures += ${plan.addBlocks.join(', ')}`);
  if (plan.addOptions.length > 0) console.log(`  ${tenantId}: subscriptions.options += ${plan.addOptions.join(', ')} (billing: ${sub.billing})`);

  if (!APPLY) continue;
  // Options first, then the blocks: features never run ahead of billing (same order as setSubscriptionOptions).
  if (plan.options) await db.collection(SUBSCRIPTIONS).doc(tenantId).set({ options: plan.options }, { merge: true });
  if (plan.enabledFeatures) await db.collection(APP_CONFIG).doc(tenantId).update({ enabledFeatures: plan.enabledFeatures });
  console.log(`  ${tenantId}: written`);
}

console.log(`\n${changed} tenant(s) ${APPLY ? 'migrated' : 'would change'}.${APPLY ? '' : ' Re-run with --apply to write.'}`);
