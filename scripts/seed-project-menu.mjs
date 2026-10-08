/**
 * ONE-TIME DATA SEED — the project menu rows (spec 3.14):
 *   - `project-all`, a `navigate` row (url `/projects/all/c-projects`, role `privileged`), and
 *   - `c-projects`, the list's context menu, with its `call` child `project-add`.
 *
 * WHY A SCRIPT AND NOT THE FEATURE PICKER
 * The rows are declared in the feature catalogue (`task` block, `libs/tenant/util/src/lib/
 * feature-blocks.ts`), so a picker save at `/tenant/features` would create them too — but only
 * AFTER the functions deploy that ships the new catalogue (`applyFeatureSelection` bakes
 * FEATURE_BLOCKS in at build time), and only for the tenant that saves. This script writes the
 * same documents for every tenant that already has `task-all`, with the catalogue's own field
 * values, so `pnpm catalogue:check` sees no drift.
 *
 * WHO GETS THE ROWS
 * Exactly the tenants that inherit `task-all` — the union of `tenants[]` over every non-archived
 * `menuItems` document named `task-all`. The `task` block owns that row, so the tenant has the
 * block enabled and the feature-block gate passes.
 *
 * WHAT IT WRITES — additive only, the same rules as `planMenuOps` (D-BB-15):
 *  - a missing document is CREATED (doc id === name === catalogue key);
 *  - an existing one is only EXTENDED: missing tenants appended, missing children appended,
 *    `isArchived: true` reset to false. Its url/action/roleNeeded/label are never overwritten.
 *  - every non-archived menu document whose `menuItems[]` contains `task-all` (the parents,
 *    shared and forks) gets `project-all` inserted right after it. Nothing else on it changes.
 *  It never touches `main_<tenantId>`, `app-config` or `enabledFeatures`.
 *
 * Usage:
 *   node scripts/seed-project-menu.mjs              # dry run (default)
 *   node scripts/seed-project-menu.mjs --dry-run    # dry run (explicit)
 *   node scripts/seed-project-menu.mjs --apply      # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ANCHOR = 'task-all';
const ROW = 'project-all';

/** Copied from the catalogue specs in feature-blocks.ts — keep the two in step. */
const SPECS = [
  { name: ROW, action: 'navigate', url: '/projects/all/c-projects', roleNeeded: 'privileged', icon: 'folder', label: '@item.project-all', menuItems: [] },
  { name: 'c-projects', action: 'context', url: '', roleNeeded: 'privileged', icon: 'help-circle', label: '', menuItems: ['project-add'] },
  { name: 'project-add', action: 'call', url: 'add', roleNeeded: 'privileged', icon: 'add-circle', label: '@item.project-add', menuItems: [] },
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

  // 1. the tenants that inherit task-all
  const anchors = (await menuItems.where('name', '==', ANCHOR).get()).docs.filter(d => d.data().isArchived !== true);
  if (anchors.length === 0) {
    console.log(`No active menuItems doc named '${ANCHOR}' — nothing to do. Enable the task block at /tenant/features first.`);
    return;
  }
  const tenants = [...new Set(anchors.flatMap(d => d.data().tenants ?? []))].sort();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — tenants with '${ANCHOR}': ${tenants.join(', ')}\n`);

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

  // 3. hang the row after task-all into every parent that lists it (shared + forks)
  const parents = (await menuItems.where('menuItems', 'array-contains', ANCHOR).get()).docs.filter(d => d.data().isArchived !== true);
  for (const snap of parents) {
    const children = snap.data().menuItems ?? [];
    if (children.includes(ROW)) {
      console.log(`  ok      menuItems/${snap.id} — already lists '${ROW}'`);
      continue;
    }
    const at = children.indexOf(ANCHOR);
    const next = [...children.slice(0, at + 1), ROW, ...children.slice(at + 1)];
    if (apply) await snap.ref.update({ menuItems: next });
    console.log(`  ${apply ? 'update ' : 'would update'} menuItems/${snap.id}: insert '${ROW}' after '${ANCHOR}'`);
    writes++;
  }

  console.log(`\n${apply ? 'writes' : 'would write'}: ${writes}`);
  if (!apply) console.log('\nRe-run with --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
