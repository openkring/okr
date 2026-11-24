/**
 * ONE-TIME SEED (spec 1.174) — the menu row `tenant-settings` («Einstellungen») in the AOC submenu of every tenant.
 *
 * Why a script: `aoc-menu` is one shared doc. The first tenant that saves the picker would append the child there for all
 * tenants, while the row itself gets only the saving tenant: the admins of the others see «Missing: tenant-settings».
 *
 * 1. Row: `menuItems/tenant-settings` is created, or its tenants extended, to the union of the tenants of every live doc
 *    named `aoc-menu` (forks included). No other field of an existing row is touched.
 * 2. AOC submenus (every doc named `aoc-menu`): the row is inserted before the closing divider, unless it is listed already.
 *    A submenu with a tenant the row does not cover is left alone.
 * An archived row, a fork of it and a duplicate are reported and nothing is written for them.
 * Re-running after an apply reports only SKIP (and the WARN lines that need a decision by hand).
 *
 * RELEASE FIRST: --apply is refused while the label is missing in the live menu bundle of a target tenant
 * (override: --allow-unreleased-labels).
 *
 * Usage:
 *   node scripts/seed-tenant-settings-menu.mjs            # dry run (default)
 *   node scripts/seed-tenant-settings-menu.mjs --apply    # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { assertMenuLabelsLive } from './lib/menu-labels.mjs';
import { PARENT_NAME, ROW_NAME, ROW_SPEC, collectTenants, parseArgs, planParent, planRow } from './seed-tenant-settings-menu.logic.mjs';

const cli = parseArgs(process.argv.slice(2));
if (cli.error) {
  console.error(cli.error);
  process.exit(1);
}
const { apply } = cli;

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
const col = db.collection('menuItems');
console.log(apply ? 'APPLY MODE\n' : 'DRY RUN (no writes) — pass --apply to write.\n');

const line = (p) => console.log(`[${p.action.toUpperCase()}] menuItems/${p.id} — ${p.reason}`);
const byName = async (name) => (await col.where('name', '==', name).get()).docs.map((s) => ({ ...s.data(), id: s.id }));

const parents = await byName(PARENT_NAME);
const tenants = collectTenants(parents);
const row = planRow(await byName(ROW_NAME), tenants);
line(row);
if (row.action === 'create') console.log(JSON.stringify(row.doc, null, 2).replace(/^/gm, '    '));
const parentPlans = parents.map((d) => planParent(d, row.tenants));
parentPlans.forEach(line);

await assertMenuLabelsLive([ROW_SPEC.label], tenants, { apply });
if (!apply) process.exit(0);

// The row first: a submenu must never list a row its tenants cannot read.
if (row.action === 'create') {
  await col.doc(row.id).create(row.doc);
  console.log(`wrote menuItems/${row.id}`);
} else if (row.action === 'extend') {
  await col.doc(row.id).update({ tenants: FieldValue.arrayUnion(...row.missing) });
  console.log(`wrote menuItems/${row.id}`);
}

// Re-read inside a transaction, re-plan against the row as it is now, write only if still needed.
for (const p of parentPlans.filter((x) => x.action === 'update')) {
  const ref = col.doc(p.id);
  const re = await db.runTransaction(async (tx) => {
    const [snap, rowSnap] = [await tx.get(ref), await tx.get(col.doc(ROW_NAME))];
    if (!snap.exists) return { id: p.id, action: 'warn', reason: 'gone' };
    const covered = rowSnap.exists && rowSnap.data().isArchived !== true ? rowSnap.data().tenants ?? [] : [];
    const plan = planParent({ ...snap.data(), id: snap.id }, covered);
    if (plan.action === 'update') tx.update(ref, { menuItems: plan.menuItems });
    return plan;
  });
  if (re.action === 'update') console.log(`wrote menuItems/${p.id}`);
  else line(re);
}
console.log('\nDone. Re-run without --apply: every line must read SKIP (WARN lines stay for a decision by hand).');
