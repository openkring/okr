/**
 * ONE-TIME DATA FIX (spec 1.101 phase 5) — AOC menu migration to the four hub rows.
 *
 * 1. Rows: `aoc-access`, `aoc-ops` and `aoc-config` are created (doc id = name), with the union of the tenants of
 *    every `aoc-menu*` doc that lists them after the plan. `aoc-data` exists already: its tenants are only ever
 *    extended, and a label that differs from the catalogue is reported, never overwritten. Fork rows (doc id !=
 *    name), archived rows and duplicate names are reported and skipped.
 * 2. kring: the shared `aoc-menu` doc (kring, okr) is split. A fork `aoc-menu_kring` (fork-on-edit shape: copy of
 *    the shared doc, `tenants: ['kring']`, `forkedFrom: 'aoc-menu'`, same `name` — parents resolve by name +
 *    tenant) is created with `[aoc-ops, aoc-config]` (the only hub routes in kring-app); then `kring` is removed
 *    from the shared doc's tenants (create-then-detach).
 * 3. AOC parents (every doc named `aoc-menu`): `[aoc-access, aoc-ops, aoc-config, aoc-data]` followed by the names
 *    they listed that the hub did not absorb (aoc-allocation, operator-chat, alias-*, person-privacy,
 *    divider_empty), in their old order.
 * 4. The ten absorbed rows (found by `name`) are archived, unless a menu doc outside `aoc-menu*` still lists them.
 *
 * Re-running after an apply reports only SKIP (and the WARN lines that need a decision by hand).
 *
 * RELEASE FIRST: run --apply only after the app release that ships the hub routes and
 * @item.aoc-access/ops/config labels is live on every app — otherwise admins lose their AOC navigation.
 * --apply is refused without --released, which confirms exactly that.
 *
 * Usage:
 *   node scripts/aoc-phase5-menu.mjs                       # dry run (default)
 *   node scripts/aoc-phase5-menu.mjs --apply --released    # perform the writes (release live on every app)
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import {
  APPLY_ORDER, FORK_SPLITS, HUB_ABSORBED, HUB_ROWS, RELEASE_FIRST, SHARED_PARENT_ID, collectRowTenants,
  gateParentOnDetach, parseArgs, planAocParent, planDetach, planFork, planLeavingRow, planRow,
} from './aoc-phase5-menu.logic.mjs';

const cli = parseArgs(process.argv.slice(2));
if (cli.error) {
  console.error(cli.error);
  process.exit(1);
}
const { apply } = cli;

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
const col = db.collection('menuItems');
console.log(apply ? `APPLY MODE — ${RELEASE_FIRST}\n` : `DRY RUN (no writes) — pass --apply --released to write.\n${RELEASE_FIRST}\n`);

const line = (p, label) => console.log(`[${p.action.toUpperCase()}] menuItems/${p.id} — ${label ? `${label}: ` : ''}${p.reason}`);
const body = (doc) => console.log(JSON.stringify(doc, null, 2).replace(/^/gm, '    '));
const byName = async (name) => (await col.where('name', '==', name).get()).docs.map((s) => ({ id: s.id, ...s.data() }));
const parentQuery = col.where('name', '==', 'aoc-menu');

const parents = await byName('aoc-menu');
const parentIds = new Set(parents.map((d) => d.id));
const shared = parents.find((d) => d.id === SHARED_PARENT_ID);

// 2. kring split (planned first: the rows' tenants derive from the post-plan parents)
const forkPlans = [];
const detachPlans = [];
const plannedForks = [];
for (const tenant of Object.keys(FORK_SPLITS)) {
  if (!shared) {
    console.log(`[NONE] no shared ${SHARED_PARENT_ID} doc; ${tenant} not split`);
    continue;
  }
  const f = planFork(shared, parents, tenant);
  forkPlans.push({ ...f, tenant });
  line(f, `fork ${tenant}`);
  if (f.action === 'create') {
    body(f.doc);
    plannedForks.push({ id: f.id, ...f.doc, planned: true });
  }
  const d = planDetach(shared, [...parents, ...plannedForks], tenant);
  detachPlans.push({ ...d, tenant });
  line(d, `detach ${tenant}`);
}

// 3. AOC parents
const parentPlans = parents.map(planAocParent);
parentPlans.forEach((p) => line(p, 'aoc-menu'));
const postPlan = [
  ...parents.map((d, i) => {
    const det = detachPlans.find((x) => x.id === d.id && x.action === 'detach');
    return { ...d, menuItems: parentPlans[i].menuItems, ...(det ? { tenants: det.tenants } : {}) };
  }),
  ...plannedForks,
];
for (const d of postPlan) console.log(`    after: ${d.id} [${(d.tenants ?? []).join(', ')}] → [${(d.menuItems ?? []).join(', ')}]`);

// 1. rows
const rowPlans = [];
for (const name of HUB_ROWS) {
  const p = planRow(await byName(name), name, collectRowTenants(postPlan, name));
  rowPlans.push({ ...p, rowName: name });
  line(p, name);
  if (p.action === 'create') body(p.doc);
}

// 4. absorbed rows
async function referrers(row) {
  const snap = await col.where('menuItems', 'array-contains', row.name).get();
  return snap.docs.filter((s) => s.id !== row.id && !parentIds.has(s.id)).map((s) => ({ id: s.id }));
}
const leavingPlans = [];
for (const name of HUB_ABSORBED) {
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
    if (re.action !== 'update') return false;
    tx.update(ref, { menuItems: re.menuItems });
    return true;
  });
}

const writtenDetachIds = new Set();
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
  forks: async () => {
    for (const p of forkPlans.filter((x) => x.action === 'create')) {
      await col.doc(p.id).create(p.doc);
      console.log(`wrote menuItems/${p.id}`);
    }
  },
  detach: async () => {
    for (const p of detachPlans.filter((x) => x.action === 'detach')) {
      const ref = col.doc(p.id);
      const done = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          console.log(`[GONE] menuItems/${p.id}`);
          return false;
        }
        const live = (await tx.get(parentQuery)).docs.map((s) => ({ id: s.id, ...s.data() }));
        const re = planDetach({ id: snap.id, ...snap.data() }, live, p.tenant);
        if (re.action !== 'detach') {
          line(re, `detach ${p.tenant}`);
          return false;
        }
        tx.update(ref, { tenants: re.tenants });
        return true;
      });
      if (done) {
        writtenDetachIds.add(p.id);
        console.log(`wrote menuItems/${p.id}`);
      }
    }
  },
  parents: async () => {
    for (const planned of parentPlans.filter((x) => x.action === 'update')) {
      const p = gateParentOnDetach(planned, detachPlans, writtenDetachIds);
      if (p.action !== 'update') {
        line(p, 'aoc-menu');
        continue;
      }
      if (await updateMenuItems(p.id, planAocParent)) console.log(`wrote menuItems/${p.id}`);
    }
  },
  leaving: async () => {
    for (const p of leavingPlans.filter((x) => x.action === 'archive')) {
      const snap = await col.doc(p.id).get();
      if (!snap.exists) {
        console.log(`[GONE] menuItems/${p.id}`);
        continue;
      }
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
console.log('\nDone. Re-run without --apply: every line must read SKIP (WARN lines stay for a decision by hand).');
