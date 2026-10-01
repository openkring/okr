/**
 * ONE-TIME DATA SEED — the Kostenstellen menu rows (spec 1.65):
 *   - `accounting-cost-centers`, a `navigate` row in the catalogued `accounting-menu` submenu
 *     (url `/accounting/@TID@/cost-center/c-cost-center`, role `treasurer`), and
 *   - `c-cost-center`, the list's context menu, with its `call` children `cost-center-add`,
 *     `cost-center-migrate-free-text` and `cost-center-migrate-backfill` (spec 1.65 §6.4).
 *
 * WHY A SCRIPT AND NOT THE FEATURE PICKER
 * The rows are declared in the feature catalogue (`finance` block, `libs/tenant/util/src/lib/
 * feature-blocks.ts`), so a picker save at `/tenant/features` would create them too — but only
 * AFTER the functions deploy that ships the new catalogue (`applyFeatureSelection` bakes
 * FEATURE_BLOCKS in at build time), and only for the tenant that saves. This script writes the
 * same documents for every tenant that already has the accounting menu, with the catalogue's
 * own field values, so `pnpm catalogue:check` sees no drift and a later picker save finds the
 * documents already correct and leaves them alone.
 *
 * WHO GETS THE ROWS
 * Exactly the tenants that already inherit `accounting-menu` — the union of `tenants[]` over
 * every non-archived `menuItems` document named `accounting-menu` (the shared one and any fork
 * like `accounting-menu_scs`). `finance` is the block that owns that submenu, so a tenant with
 * the submenu has the block enabled; the feature-block gate (gate 2) therefore passes.
 *
 * WHAT IT WRITES — additive only, the same rules as `planMenuOps` (D-BB-15):
 *  - a missing document is CREATED (doc id === name === catalogue key);
 *  - an existing one is only EXTENDED: missing tenants appended, missing children appended,
 *    `isArchived: true` reset to false. Its url/action/roleNeeded/label are never overwritten.
 *  - every `accounting-menu` document (shared and forks) gets `accounting-cost-centers`
 *    inserted into its `menuItems[]` right after `accounting-accounts` (or appended when that
 *    row is missing). Nothing else on it changes.
 *  It never touches `main_<tenantId>`, `app-config` or `enabledFeatures`.
 *
 * Usage:
 *   node scripts/seed-cost-center-menu.mjs              # dry run (default)
 *   node scripts/seed-cost-center-menu.mjs --dry-run    # dry run (explicit)
 *   node scripts/seed-cost-center-menu.mjs --apply      # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PARENT = 'accounting-menu';
const ROW = 'accounting-cost-centers';
const AFTER = 'accounting-accounts';

/** Copied from the catalogue specs in feature-blocks.ts — keep the two in step. */
const SPECS = [
  { name: ROW, action: 'navigate', url: '/accounting/@TID@/cost-center/c-cost-center', roleNeeded: 'treasurer', icon: 'target', label: '@item.accounting-cost-centers', menuItems: [] },
  { name: 'c-cost-center', action: 'context', url: '', roleNeeded: 'treasurer', icon: 'help-circle', label: '', menuItems: ['cost-center-add', 'cost-center-migrate-free-text', 'cost-center-migrate-backfill'] },
  { name: 'cost-center-add', action: 'call', url: 'add', roleNeeded: 'treasurer', icon: 'add-circle', label: '@item.cost-center-add', menuItems: [] },
  { name: 'cost-center-migrate-free-text', action: 'call', url: 'migrate-free-text', roleNeeded: 'treasurer', icon: 'sync', label: '@item.cost-center-migrate-free-text', menuItems: [] },
  { name: 'cost-center-migrate-backfill', action: 'call', url: 'migrate-backfill', roleNeeded: 'treasurer', icon: 'download', label: '@item.cost-center-migrate-backfill', menuItems: [] },
];

/** The shape `planMenuOps` creates (`libs/tenant/util/src/lib/menu-seed.util.ts`). */
function newDoc(spec, tenants) {
  return {
    name: spec.name,
    url: spec.url,
    action: spec.action,
    roleNeeded: spec.roleNeeded,
    icon: spec.icon,
    label: spec.label,
    tenants,
    menuItems: spec.menuItems,
    // isArchived is REQUIRED: getSystemQuery filters `isArchived == false`, which skips docs missing the field.
    isArchived: false,
    index: `n:${spec.name} a:${spec.action} k:${spec.name}`,
  };
}

const apply = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const menuItems = db.collection('menuItems');

  // 1. the tenants that inherit the accounting submenu
  const parents = (await menuItems.where('name', '==', PARENT).get()).docs.filter(d => d.data().isArchived !== true);
  if (parents.length === 0) {
    console.log(`No active menuItems doc named '${PARENT}' — nothing to do. Enable the finance block at /tenant/features first.`);
    return;
  }
  const tenants = [...new Set(parents.flatMap(d => d.data().tenants ?? []))].sort();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — tenants with '${PARENT}': ${tenants.join(', ')}\n`);

  let writes = 0;

  // 2. the catalogue documents: create, or extend (tenants, children, unarchive) only
  for (const spec of SPECS) {
    const existing = (await menuItems.where('name', '==', spec.name).get()).docs;
    if (existing.length === 0) {
      const ref = menuItems.doc(spec.name);
      // create(), not set(): a concurrent creation must fail loudly rather than overwrite.
      if (apply) await ref.create(newDoc(spec, tenants));
      console.log(`  ${apply ? 'create ' : 'would create'} menuItems/${spec.name} (${spec.action}, ${spec.roleNeeded}) tenants=[${tenants.join(', ')}]`);
      writes++;
      continue;
    }
    for (const snap of existing) {
      const data = snap.data();
      const patch = {};
      const missingTenants = tenants.filter(t => !(data.tenants ?? []).includes(t));
      if (missingTenants.length > 0) patch.tenants = [...(data.tenants ?? []), ...missingTenants];
      const missingChildren = spec.menuItems.filter(k => !(data.menuItems ?? []).includes(k));
      if (missingChildren.length > 0) patch.menuItems = [...(data.menuItems ?? []), ...missingChildren];
      if (data.isArchived === true) patch.isArchived = false;
      if (data.url !== spec.url || data.action !== spec.action || data.roleNeeded !== spec.roleNeeded) {
        console.log(`  note    menuItems/${snap.id} differs from the catalogue (url/action/roleNeeded) — left as is`);
      }
      if (Object.keys(patch).length === 0) {
        console.log(`  ok      menuItems/${snap.id} — already complete`);
        continue;
      }
      if (apply) await snap.ref.update(patch);
      console.log(`  ${apply ? 'update ' : 'would update'} menuItems/${snap.id}: ${JSON.stringify(patch)}`);
      writes++;
    }
  }

  // 3. hang the row into every accounting-menu document (shared + forks)
  for (const snap of parents) {
    const children = snap.data().menuItems ?? [];
    if (children.includes(ROW)) {
      console.log(`  ok      menuItems/${snap.id} — already lists '${ROW}'`);
      continue;
    }
    const at = children.indexOf(AFTER);
    const next = at >= 0 ? [...children.slice(0, at + 1), ROW, ...children.slice(at + 1)] : [...children, ROW];
    if (apply) await snap.ref.update({ menuItems: next });
    console.log(`  ${apply ? 'update ' : 'would update'} menuItems/${snap.id}: insert '${ROW}' ${at >= 0 ? `after '${AFTER}'` : 'at the end'}`);
    writes++;
  }

  console.log(`\n${apply ? 'writes' : 'would write'}: ${writes}`);
  if (!apply) console.log('\nRe-run with --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
