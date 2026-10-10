/**
 * ONE-TIME DATA SEED — the Umlagen menu rows (spec 1.65 D24):
 *   - `accounting-allocations`, a `navigate` row in the catalogued `accounting-menu` submenu
 *     (url `/accounting/@BOOKS@/allocation/c-allocation` — the default books, never the app tenant;
 *     role `treasurer`), right after `accounting-budgets`, and
 *   - `c-allocation`, the list's context menu, with its `call` child `allocation-add`.
 * Run `--apply` only after the app release that ships the route and the `@BOOKS@` token.
 * A copy of `seed-budget-menu.mjs`; the same additive rules and the same reason for being a script
 * (the catalogue reaches existing tenants only after a functions deploy and a picker save).
 *
 * Usage:
 *   node scripts/seed-allocation-menu.mjs            # dry run (default)
 *   node scripts/seed-allocation-menu.mjs --apply    # perform the writes
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PARENT = 'accounting-menu';
const ROW = 'accounting-allocations';
const AFTER = 'accounting-budgets';

/** Copied from the catalogue specs in feature-blocks.ts — keep the two in step. */
const SPECS = [
  { name: ROW, action: 'navigate', url: '/accounting/@BOOKS@/allocation/c-allocation', roleNeeded: 'treasurer', icon: 'swap-horizontal', label: '@item.accounting-allocations', menuItems: [] },
  { name: 'c-allocation', action: 'context', url: '', roleNeeded: 'treasurer', icon: 'help-circle', label: '', menuItems: ['allocation-add'] },
  { name: 'allocation-add', action: 'call', url: 'add', roleNeeded: 'treasurer', icon: 'add-circle', label: '@item.allocation-add', menuItems: [] },
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
