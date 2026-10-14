/**
 * ONE-TIME DATA FIX (spec 1.101 phase 1) — AOC menu migration.
 *
 * 1. Every `aoc-menu` doc drops `aoc-storage` and `flighttracker`, and gains `aoc-email`
 *    (after aoc-doc / aoc-account / aoc-sessions, else before divider_empty, else at the end).
 * 2. Tenants that had the flight tracker under AOC get it appended to their `main_<tid>`.
 * 3. The `aoc-storage` row is archived.
 * 4. The `aoc-email` row is created (or its tenants extended) for all AOC parents' tenants.
 *
 * Re-running after an apply reports only SKIP.
 *
 * Usage:
 *   node scripts/aoc-phase1-menu.mjs            # dry run (default)
 *   node scripts/aoc-phase1-menu.mjs --apply    # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { APPLY_ORDER, EMAIL, planAocParent, planEmailRow, planRootDoc, planStorageRow, STORAGE } from './aoc-phase1-menu.logic.mjs';

const args = process.argv.slice(2);
if (args.some((a) => a !== '--apply' && a !== '--dry-run')) {
  console.error('Usage: node scripts/aoc-phase1-menu.mjs [--dry-run|--apply]');
  process.exit(1);
}
const apply = args.includes('--apply');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
const col = db.collection('menuItems');
console.log(apply ? 'APPLY MODE\n' : 'DRY RUN (no writes) — pass --apply to write.\n');

const line = (p) => console.log(`[${p.action.toUpperCase()}] menuItems/${p.id ?? EMAIL} — ${p.reason}`);

// 1. AOC parents
const parentDocs = (await col.where('name', '==', 'aoc-menu').get()).docs.map((s) => ({ id: s.id, ...s.data() }));
const parentPlans = parentDocs.map(planAocParent);
parentPlans.forEach(line);

// 2. root docs
const flightTenants = [...new Set(parentPlans.flatMap((p) => p.flightTenants))];
const parentTenants = [...new Set(parentDocs.flatMap((d) => (Array.isArray(d.tenants) ? d.tenants : [])))];
const rootPlans = [];
for (const tid of parentTenants) {
  const snap = await col.doc(`main_${tid}`).get();
  if (!snap.exists) {
    console.log(`[MISSING] main_${tid}`);
    continue;
  }
  const plan = planRootDoc({ id: snap.id, ...snap.data() }, flightTenants);
  rootPlans.push(plan);
  line(plan);
}

// 3. storage rows
const storagePlans = (await col.where('name', '==', STORAGE).get()).docs.map((s) => planStorageRow({ id: s.id, ...s.data() }));
storagePlans.forEach(line);

// 4. e-mail row
const emailSnap = (await col.where('name', '==', EMAIL).get()).docs[0];
const emailPlan = planEmailRow(emailSnap ? { id: emailSnap.id, ...emailSnap.data() } : undefined, parentTenants);
line(emailPlan);

const dataSnap = await col.doc('aoc-data').get();
const template = dataSnap.exists ? dataSnap.data() : undefined;
console.log('\nmenuItems/aoc-data (field-set template):');
console.log(JSON.stringify(template, null, 2));

if (!apply) process.exit(0);

const emailDoc = {
  ...template,
  name: EMAIL,
  url: '/aoc/email',
  action: 'navigate',
  roleNeeded: 'admin',
  icon: 'email',
  label: '@item.aoc-email',
  tenants: emailPlan.tenants,
  menuItems: [],
  data: [],
  description: '',
  tags: '',
  isArchived: false,
  index: `n:${EMAIL} a:navigate k:${EMAIL}`,
};
delete emailDoc.okey;

// Re-read inside a transaction, re-plan, write only if still needed. Returns true when it wrote.
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
  email: async () => {
    if (emailPlan.action === 'create') {
      await col.doc(EMAIL).create(emailDoc);
      console.log(`wrote menuItems/${EMAIL}`);
    } else if (emailPlan.action === 'extend') {
      const have = Array.isArray(emailSnap.data().tenants) ? emailSnap.data().tenants : [];
      await col.doc(emailPlan.id).update({ tenants: FieldValue.arrayUnion(...emailPlan.tenants.filter((t) => !have.includes(t))) });
      console.log(`wrote menuItems/${emailPlan.id}`);
    }
  },
  // Roots BEFORE parents: flightTenants is derived from the parents' current `flighttracker` entries.
  // If parents were rewritten first and the run died, a re-run would see no flight tracker and skip the roots,
  // losing it for kring/okr/bka. Roots first keeps an interrupted run recoverable.
  roots: async () => {
    for (const p of rootPlans.filter((x) => x.action === 'append')) {
      if (await updateMenuItems(p.id, (d) => planRootDoc(d, flightTenants))) console.log(`wrote menuItems/${p.id}`);
    }
  },
  parents: async () => {
    for (const p of parentPlans.filter((x) => x.action === 'update')) {
      if (await updateMenuItems(p.id, planAocParent)) console.log(`wrote menuItems/${p.id}`);
    }
  },
  storage: async () => {
    for (const p of storagePlans.filter((x) => x.action === 'archive')) {
      await col.doc(p.id).update({ isArchived: true });
      console.log(`wrote menuItems/${p.id}`);
    }
  },
};
for (const name of APPLY_ORDER) await steps[name]();
console.log('\nDone. Re-run without --apply: every line must read SKIP.');
