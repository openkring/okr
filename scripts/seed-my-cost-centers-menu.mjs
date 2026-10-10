/**
 * ONE-TIME DATA SEED — the «Meine Kostenstellen» menu row (spec 1.65 phase 3, §7.4):
 *   - `my-cost-centers`, a `navigate` row (url `/my-cost-centers/@TID@` — the tenant's own books; a second set of books such as gss needs a hand-authored row with its accountingTenantId, role `registered`) in the
 *     catalogued `finance-menu` submenu, right after `expenses`.
 *
 * RUN `--apply` ONLY AFTER THE APP RELEASE that ships the `/my-cost-centers` route — the row is
 * visible to every member, and an app without the route would answer it with a 404.
 *
 * WHY A SCRIPT AND NOT THE FEATURE PICKER: the row is declared in the feature catalogue (`finance`
 * block, `libs/tenant/util/src/lib/feature-blocks.ts`), so a picker save at `/tenant/features`
 * creates it too — but only after the functions deploy that ships the new catalogue
 * (`applyFeatureSelection` bakes FEATURE_BLOCKS in at build time), and only for the tenant that
 * saves. This script writes the same document for every tenant that already has `finance-menu`,
 * with the catalogue's own field values. A copy of `seed-budget-menu.mjs`; same additive rules.
 *
 * Usage:
 *   node scripts/seed-my-cost-centers-menu.mjs            # dry run (default)
 *   node scripts/seed-my-cost-centers-menu.mjs --apply    # perform the writes
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PARENT = 'finance-menu';
const ROW = 'my-cost-centers';
const AFTER = 'expenses';

/** Copied from the catalogue specs in feature-blocks.ts — keep the two in step. */
const SPECS = [
  { name: ROW, action: 'navigate', url: '/my-cost-centers/@TID@', roleNeeded: 'registered', icon: 'moneybag', label: '@item.my-cost-centers', menuItems: [] },
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

  // 1. the tenants that inherit the finance submenu
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

  // 3. hang the row into every finance-menu document (shared + forks)
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
