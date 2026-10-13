/**
 * ONE-TIME DATA FIX (spec 1.101 §6, phase 0) — tenant allocation becomes a bka-only tool.
 *
 * 1. The shared menu row `aoc-allocation` gets `tenants: ['bka']` and url `/operator/allocation`
 *    (the route that exists only in apps/bka-app).
 * 2. Every menu parent that lists `aoc-allocation` and does not belong to bka drops it
 *    (FieldValue.arrayRemove — nothing else on the doc is touched). bka's own `aoc-menu_bka` keeps it.
 *
 * Forks owned by another tenant and parents shared by bka with another tenant are CONFLICTS: they
 * are reported and block --apply. Re-running after an apply reports only «skip».
 *
 * Run AFTER the functions deploy and the app releases (so bka has the route).
 *
 * Usage:
 *   node scripts/restrict-allocation-to-bka.mjs            # dry run (default)
 *   node scripts/restrict-allocation-to-bka.mjs --apply    # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { OPERATOR_TENANT, OPERATOR_URL, planParentDocs, planRowDocs, ROW_NAME } from './restrict-allocation-to-bka.logic.mjs';

const args = process.argv.slice(2);
if (args.some((a) => a !== '--apply' && a !== '--dry-run')) {
  console.error('Usage: node scripts/restrict-allocation-to-bka.mjs [--dry-run|--apply]');
  process.exit(1);
}
const apply = args.includes('--apply');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
console.log(apply ? 'APPLY MODE\n' : 'DRY RUN (no writes) — pass --apply to write.\n');

const rows = (await db.collection('menuItems').where('name', '==', ROW_NAME).get()).docs;
const parents = (await db.collection('menuItems').where('menuItems', 'array-contains', ROW_NAME).get()).docs;

const rowPlans = planRowDocs(rows.map((s) => ({ id: s.id, ...s.data() })));
const parentPlans = planParentDocs(parents.map((s) => ({ id: s.id, ...s.data() })));

for (const p of [...rowPlans, ...parentPlans]) console.log(`[${p.action.toUpperCase()}] menuItems/${p.id} — ${p.reason}`);

const conflicts = [...rowPlans, ...parentPlans].filter((p) => p.action === 'conflict');
if (conflicts.length > 0) {
  console.error(`\n${conflicts.length} conflict(s) — nothing written. Resolve them by hand, then re-run.`);
  process.exit(1);
}
if (!apply) process.exit(0);

for (const p of rowPlans.filter((x) => x.action === 'restrict')) {
  await db.collection('menuItems').doc(p.id).update({ tenants: [OPERATOR_TENANT], url: OPERATOR_URL });
  console.log(`wrote menuItems/${p.id}`);
}
for (const p of parentPlans.filter((x) => x.action === 'detach')) {
  await db.collection('menuItems').doc(p.id).update({ menuItems: FieldValue.arrayRemove(ROW_NAME) });
  console.log(`wrote menuItems/${p.id}`);
}
console.log('\nDone. Re-run without --apply: every line must read SKIP.');
