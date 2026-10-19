/**
 * ONE-TIME DATA FIX (spec 1.101 phase 2) — AOC menu migration.
 *
 * 1. Rows: the maintenance rows are created (doc id = name) or get their tenants extended, with the union of
 *    the tenants of every context menu that lists them. Existing row docs are never overwritten; fork rows
 *    (doc id != name) and duplicate names are reported and skipped.
 * 2. Context menus (`c-calevents`, `c-groups`, `c-persons`, `c-pages`, `c-documents`, `c-trips` incl. forks,
 *    `c-diary`): the missing maintenance names are appended at the end. Nothing else changes; no menu is created.
 * 3. AOC parents (`aoc-menu*`) drop aoc-content / aoc-doc / aoc-diary / aoc-kiosk.
 * 4. The four leaving rows (found by `name`) are archived, unless another menu doc still lists them.
 *
 * Re-running after an apply reports only SKIP.
 *
 * Usage:
 *   node scripts/aoc-phase2-menu.mjs            # dry run (default)
 *   node scripts/aoc-phase2-menu.mjs --apply    # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import {
  APPLY_ORDER, LEAVING, MAINT, collectRowTenants, planAocParent, planContextMenu, planLeavingRow, planRow,
} from './aoc-phase2-menu.logic.mjs';

const args = process.argv.slice(2);
if (args.some((a) => a !== '--apply' && a !== '--dry-run')) {
  console.error('Usage: node scripts/aoc-phase2-menu.mjs [--dry-run|--apply]');
  process.exit(1);
}
const apply = args.includes('--apply');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
const col = db.collection('menuItems');
console.log(apply ? 'APPLY MODE\n' : 'DRY RUN (no writes) — pass --apply to write.\n');

const line = (p, label) => console.log(`[${p.action.toUpperCase()}] menuItems/${p.id} — ${label ? `${label}: ` : ''}${p.reason}`);
const byName = async (name) => (await col.where('name', '==', name).get()).docs.map((s) => ({ id: s.id, ...s.data() }));

// 2. context menus (planned first: the rows' tenants derive from the post-plan lists)
const contextPlans = [];
const postPlanDocs = [];
for (const [ctx, names] of Object.entries(MAINT)) {
  const docs = (await byName(ctx)).filter((d) => d.isArchived !== true);
  if (!docs.length) console.log(`[NONE] no ${ctx} doc (no menu is created)`);
  for (const d of docs) {
    const p = planContextMenu(d, names);
    contextPlans.push({ ...p, ctx });
    postPlanDocs.push({ ...d, menuItems: p.menuItems });
    line(p, ctx);
  }
}

// 1. rows
const rowNames = [...new Set(Object.values(MAINT).flat())];
const rowPlans = [];
for (const name of rowNames) {
  const p = planRow(await byName(name), name, collectRowTenants(postPlanDocs, name));
  rowPlans.push({ ...p, rowName: name });
  line(p, name);
}

// 3. AOC parents
const parentPlans = (await byName('aoc-menu')).map(planAocParent);
parentPlans.forEach((p) => line(p, 'aoc-menu'));
const parentIds = new Set(parentPlans.map((p) => p.id));

// 4. leaving rows
async function referrers(row) {
  const snap = await col.where('menuItems', 'array-contains', row.name).get();
  return snap.docs.filter((s) => s.id !== row.id && !parentIds.has(s.id)).map((s) => ({ id: s.id }));
}
const leavingPlans = [];
for (const name of LEAVING) {
  const docs = await byName(name);
  if (!docs.length) console.log(`[NONE] no ${name} row doc`);
  for (const d of docs) {
    const p = planLeavingRow(d, await referrers(d));
    leavingPlans.push({ ...p, rowName: name });
    line(p, name);
  }
}

if (!apply) process.exit(0);

// Re-read inside a transaction, re-plan, write only if still needed.
async function updateMenuItems(id, replan) {
  const ref = col.doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      console.log(`[GONE] menuItems/${id}`);
      return false;
    }
    const re = replan({ id: snap.id, ...snap.data() });
    if (re.action !== 'update' && re.action !== 'append') return false;
    tx.update(ref, { menuItems: re.menuItems });
    return true;
  });
}

const steps = {
  rows: async () => {
    for (const p of rowPlans) {
      if (p.action === 'create') {
        await col.doc(p.id).create(p.doc);
        console.log(`wrote menuItems/${p.id}`);
      } else if (p.action === 'extend') {
        await col.doc(p.id).update({ tenants: FieldValue.arrayUnion(...p.tenants) });
        console.log(`wrote menuItems/${p.id}`);
      }
    }
  },
  contexts: async () => {
    for (const p of contextPlans.filter((x) => x.action === 'append')) {
      if (await updateMenuItems(p.id, (d) => planContextMenu(d, MAINT[p.ctx]))) console.log(`wrote menuItems/${p.id}`);
    }
  },
  parents: async () => {
    for (const p of parentPlans.filter((x) => x.action === 'update')) {
      if (await updateMenuItems(p.id, planAocParent)) console.log(`wrote menuItems/${p.id}`);
    }
  },
  leaving: async () => {
    for (const p of leavingPlans.filter((x) => x.action === 'archive')) {
      const snap = await col.doc(p.id).get();
      const re = planLeavingRow({ id: snap.id, ...snap.data() }, await referrers({ id: snap.id, name: p.rowName }));
      if (re.action !== 'archive') {
        line(re, p.rowName);
        continue;
      }
      await col.doc(p.id).update({ isArchived: true });
      console.log(`wrote menuItems/${p.id}`);
    }
  },
};
for (const name of APPLY_ORDER) await steps[name]();
console.log('\nDone. Re-run without --apply: every line must read SKIP.');
