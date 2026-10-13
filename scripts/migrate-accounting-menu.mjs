/**
 * ONE-TIME MIGRATION (spec 1.100) — the accounting submenu becomes eight work areas.
 *
 *  1. creates the five new area rows (or extends their tenants[] / unarchives them);
 *  2. sets every `accounting-menu` document's children to the eight area keys, KEEPING any child
 *     that is not a retired accounting row (e.g. `contract-all-treasurer`, tenant additions) after them;
 *  3. scs: replaces `scsf_fibu` in `main_scs` by `accounting-menu` and removes `gssf_fibu`.
 *     Both documents are kept (not archived) — rollback = put them back into main_scs.
 *
 * Retired row documents are NOT archived: their labels stay in the bundle and nothing points at them.
 * Forked accounting menus (`forkedFrom`) are reported and skipped — decide by hand.
 *
 * Usage:
 *   node scripts/migrate-accounting-menu.mjs           # dry run (default)
 *   node scripts/migrate-accounting-menu.mjs --apply   # write
 * Requires: gcloud auth application-default login. Release the labels FIRST.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { assertMenuLabelsLive, menuLabelsOf } from './lib/menu-labels.mjs';

const PARENT = 'accounting-menu';
const AREA_KEYS = ['accounting-overview', 'accounting-journal', 'accounting-bills', 'accounting-invoices', 'accounting-cost', 'accounting-reports', 'accounting-closing', 'accounting-master-data'];
const RETIRED = new Set([
  'accounting-accounts', 'accounting-cost-centers', 'accounting-budgets', 'accounting-allocations', 'accounting-open-items',
  'accounting-periods', 'accounting-balance', 'accounting-income-statement', 'accounting-cash-flow', 'accounting-assets',
  'accounting-depreciation-run', 'accounting-payments', 'accounting-ocr-rules', 'accounting-bank-import', 'accounting-bank-rules',
  'accounting-bank-profiles', 'accounting-settings', 'memberfees',
]);

/** Copied from the catalogue (feature-blocks.ts, finance block) — keep the two in step. */
const NEW_SPECS = [
  { name: 'accounting-overview', action: 'navigate', url: '/accounting/@BOOKS@/overview', roleNeeded: 'treasurer', icon: 'checkmark', label: '@item.accounting-overview', menuItems: [] },
  { name: 'accounting-cost', action: 'navigate', url: '/accounting/@BOOKS@/cost-center/c-cost-center', roleNeeded: 'treasurer', icon: 'target', label: '@item.accounting-cost', menuItems: [] },
  { name: 'accounting-reports', action: 'navigate', url: '/accounting/@BOOKS@/balance/c-report', roleNeeded: 'treasurer', icon: 'chart', label: '@item.accounting-reports', menuItems: [] },
  { name: 'accounting-closing', action: 'navigate', url: '/accounting/@BOOKS@/periods/c-period', roleNeeded: 'treasurer', icon: 'calendar', label: '@item.accounting-closing', menuItems: [] },
  { name: 'accounting-master-data', action: 'navigate', url: '/accounting/@BOOKS@/account/c-account', roleNeeded: 'treasurer', icon: 'settings', label: '@item.accounting-master-data', menuItems: [] },
];

function newDoc(spec, tenants) {
  return {
    name: spec.name, url: spec.url, action: spec.action, roleNeeded: spec.roleNeeded, icon: spec.icon, label: spec.label,
    tenants, menuItems: spec.menuItems, isArchived: false, index: `n:${spec.name} a:${spec.action} k:${spec.name}`,
  };
}

const apply = process.argv.includes('--apply');
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const menuItems = db.collection('menuItems');
  let writes = 0;

  const parents = (await menuItems.where('name', '==', PARENT).get()).docs.filter(d => d.data().isArchived !== true);
  if (parents.length === 0) { console.log(`No active '${PARENT}' — nothing to do.`); return; }
  const tenants = [...new Set(parents.flatMap(d => d.data().tenants ?? []))].sort();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — tenants with '${PARENT}': ${tenants.join(', ')}\n`);
  await assertMenuLabelsLive([...menuLabelsOf(NEW_SPECS), '@item.accounting-menu'], tenants, { apply });

  // 1. new area rows
  for (const spec of NEW_SPECS) {
    const existing = (await menuItems.where('name', '==', spec.name).get()).docs;
    if (existing.length === 0) {
      if (apply) await menuItems.doc(spec.name).create(newDoc(spec, tenants));
      console.log(`  ${apply ? 'create ' : 'would create'} menuItems/${spec.name}`);
      writes++;
      continue;
    }
    for (const snap of existing) {
      const data = snap.data();
      const patch = {};
      const missing = tenants.filter(t => !(data.tenants ?? []).includes(t));
      if (missing.length) patch.tenants = [...(data.tenants ?? []), ...missing];
      if (data.isArchived === true) patch.isArchived = false;
      if (Object.keys(patch).length === 0) { console.log(`  ok      menuItems/${snap.id}`); continue; }
      if (apply) await snap.ref.update(patch);
      console.log(`  ${apply ? 'update ' : 'would update'} menuItems/${snap.id}: ${JSON.stringify(patch)}`);
      writes++;
    }
  }

  // 2. the accounting submenu(s)
  for (const snap of parents) {
    const data = snap.data();
    if (data.forkedFrom) { console.log(`  SKIP    menuItems/${snap.id} is a fork of ${data.forkedFrom} — migrate by hand`); continue; }
    const current = data.menuItems ?? [];
    const kept = current.filter(k => !RETIRED.has(k) && !AREA_KEYS.includes(k));
    const next = [...AREA_KEYS, ...kept];
    if (same(current, next)) { console.log(`  ok      menuItems/${snap.id} — already migrated`); continue; }
    if (apply) await snap.ref.update({ menuItems: next });
    console.log(`  ${apply ? 'update ' : 'would update'} menuItems/${snap.id}: [${current.join(', ')}] → [${next.join(', ')}]`);
    writes++;
  }

  // 3. scs root menu
  const root = await menuItems.doc('main_scs').get();
  if (root.exists) {
    const items = root.data().menuItems ?? [];
    let next = [...items];
    const at = next.indexOf('scsf_fibu');
    if (!next.includes(PARENT)) next = at >= 0 ? [...next.slice(0, at), PARENT, ...next.slice(at)] : [...next, PARENT];
    next = next.filter(k => k !== 'scsf_fibu' && k !== 'gssf_fibu');
    if (same(items, next)) console.log('  ok      menuItems/main_scs — already migrated');
    else {
      if (apply) await root.ref.update({ menuItems: next });
      console.log(`  ${apply ? 'update ' : 'would update'} menuItems/main_scs: remove scsf_fibu, gssf_fibu; ${PARENT} at ${at >= 0 ? at : 'end'}`);
      writes++;
    }
    const parentDoc = parents.find(p => (p.data().tenants ?? []).includes('scs'));
    if (!parentDoc) console.log(`  WARN    no '${PARENT}' document lists tenant scs — enable it via /tenant/features first`);
  }

  console.log(`\n${apply ? 'writes' : 'would write'}: ${writes}`);
  if (!apply) console.log('\nRe-run with --apply to write.');
}

main().catch(err => { console.error(err); process.exit(1); });
