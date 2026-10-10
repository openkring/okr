/**
 * ONE-TIME DATA SEED — the project list's budget-comparison toggle (spec 1.65 D25):
 * `project-budget-view` (action `toggle`, url `toggleBudget`, role `privileged`) as a child of every live
 * `c-projects` context menu. Run `--apply` only after the app release that understands `toggleBudget`.
 * Additive only: a missing doc is created, an existing one only gains missing tenants; `c-projects` docs
 * only gain the child.
 *
 * Usage: node scripts/seed-project-budget-menu.mjs [--apply]
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PARENT = 'c-projects';
const SPEC = { name: 'project-budget-view', action: 'toggle', url: 'toggleBudget', roleNeeded: 'privileged', icon: 'moneybag', iconAlt: 'list',
  label: '@item.project-budget-view', labelAlt: '@item.project-budget-view_alt', menuItems: [] };
const apply = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const menuItems = db.collection('menuItems');
  const parents = (await menuItems.where('name', '==', PARENT).get()).docs.filter(d => d.data().isArchived !== true);
  const tenants = [...new Set(parents.flatMap(d => d.data().tenants ?? []))].sort();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — tenants with '${PARENT}': ${tenants.join(', ')}\n`);
  let writes = 0;
  const existing = (await menuItems.where('name', '==', SPEC.name).get()).docs;
  if (existing.length === 0) {
    const doc = { ...SPEC, tenants, isArchived: false, index: `n:${SPEC.name} a:${SPEC.action} k:${SPEC.name}` };
    if (apply) await menuItems.doc(SPEC.name).create(doc);
    console.log(`  ${apply ? 'create ' : 'would create'} menuItems/${SPEC.name} tenants=[${tenants.join(', ')}]`); writes++;
  } else {
    for (const snap of existing) {
      const missing = tenants.filter(t => !(snap.data().tenants ?? []).includes(t));
      if (missing.length === 0) { console.log(`  ok      menuItems/${snap.id}`); continue; }
      if (apply) await snap.ref.update({ tenants: [...(snap.data().tenants ?? []), ...missing] });
      console.log(`  ${apply ? 'update ' : 'would update'} menuItems/${snap.id}: + tenants ${missing.join(', ')}`); writes++;
    }
  }
  for (const snap of parents) {
    const kids = snap.data().menuItems ?? [];
    if (kids.includes(SPEC.name)) { console.log(`  ok      menuItems/${snap.id} — already lists it`); continue; }
    if (apply) await snap.ref.update({ menuItems: [...kids, SPEC.name] });
    console.log(`  ${apply ? 'update ' : 'would update'} menuItems/${snap.id}: append '${SPEC.name}'`); writes++;
  }
  console.log(`\n${apply ? 'writes' : 'would write'}: ${writes}`);
  if (!apply) console.log('Re-run with --apply to write.');
}
main().catch(err => { console.error(err); process.exit(1); });
