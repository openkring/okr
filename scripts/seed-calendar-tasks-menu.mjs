/**
 * ONE-TIME DATA CHANGE — «Termine und Aufgaben» on la21staefa (2026-11-21).
 *
 * The catalogue now nests `task-all`, `task-my`, `invitation-all` and `calevent-all` under the
 * shared parent `calendar-tasks-menu` (`calendarTasksMenuParent`, feature-blocks.ts). A picker
 * save would create that parent and append it to the root, but would leave the four flat rows
 * in place and never reorder. This script does the tenant's curation by hand:
 *
 *   1. `menuItems/calendar-tasks-menu`: created (or extended by this tenant) with the four
 *      children in the order Alle Todos, Meine Aufgaben, Einladungen, Alle Termine.
 *   2. `main_<tenant>`: the four rows leave the root, the new parent takes the place of the
 *      first of them; `project-all` and `yearlyevent-all` leave the root; `version` is the last row.
 *   3. `app-config/<tenant>.hiddenMenuKeys` gains `project-all` and `yearlyevent-all` — the
 *      durable opt-out (a picker save would re-append a row only removed from the root).
 *
 * The label `@item.calendar-tasks-menu` must be in the tenant's live menu bundle first
 * (release first, seed second) — `assertMenuLabelsLive` refuses `--apply` otherwise.
 *
 * Usage:
 *   node scripts/seed-calendar-tasks-menu.mjs                 # dry run
 *   node scripts/seed-calendar-tasks-menu.mjs --apply
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertMenuLabelsLive } from './lib/menu-labels.mjs';

const TENANT = 'la21staefa';
const PARENT = 'calendar-tasks-menu';
const CHILDREN = ['task-all', 'task-my', 'invitation-all', 'calevent-all'];
const HIDE = ['project-all', 'yearlyevent-all'];
const TAIL = 'version';
const LABEL = '@item.calendar-tasks-menu';

const apply = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const log = (verb, msg) => console.log(`  ${(apply ? verb : 'would ' + verb).padEnd(14)} ${msg}`);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${TENANT}\n`);

  await assertMenuLabelsLive([LABEL], [TENANT], { apply });

  const snap = await db.collection('menuItems').where('name', 'in', [PARENT, TAIL, ...CHILDREN]).get();
  const live = snap.docs.filter(d => d.data().isArchived !== true);
  for (const name of [TAIL, ...CHILDREN]) {
    if (!live.some(d => d.data().name === name && (d.data().tenants ?? []).includes(TENANT))) {
      throw new Error(`menu row ${name} is not live for ${TENANT} — refusing`);
    }
  }

  // 1. the parent
  const parents = live.filter(d => d.data().name === PARENT);
  if (parents.length > 1) throw new Error(`${parents.length} live docs named ${PARENT} — refusing`);
  if (parents.length === 0) {
    const data = {
      okey: PARENT, name: PARENT, url: '', action: 'sub', roleNeeded: 'registered',
      icon: 'calendar', label: LABEL, description: '', tags: '', data: [],
      tenants: [TENANT], menuItems: CHILDREN, isArchived: false,
      index: `n:${PARENT} a:sub k:${PARENT}`,
    };
    if (apply) await db.collection('menuItems').doc(PARENT).set(data);
    log('create', `menuItems/${PARENT} [${CHILDREN.join(', ')}]`);
  } else {
    const ref = parents[0].ref;
    const cur = parents[0].data();
    const patch = {};
    if (!(cur.tenants ?? []).includes(TENANT)) patch.tenants = [...cur.tenants, TENANT];
    const missing = CHILDREN.filter(c => !(cur.menuItems ?? []).includes(c));
    if (missing.length) patch.menuItems = [...(cur.menuItems ?? []), ...missing];
    if (Object.keys(patch).length) {
      if (apply) await ref.update(patch);
      log('update', `menuItems/${ref.id} ${JSON.stringify(patch)}`);
    } else console.log(`  ok             menuItems/${ref.id}`);
  }

  // 2. the root
  const rootRef = db.collection('menuItems').doc(`main_${TENANT}`);
  const current = (await rootRef.get()).data()?.menuItems ?? [];
  const firstAt = current.findIndex(k => CHILDREN.includes(k));
  const body = [];
  current.forEach((k, i) => {
    if (i === firstAt && !current.includes(PARENT)) body.push(PARENT);
    if (CHILDREN.includes(k) || HIDE.includes(k) || k === TAIL) return;
    body.push(k);
  });
  if (!body.includes(PARENT)) body.push(PARENT);
  const next = [...body, TAIL];
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    if (apply) await rootRef.update({ menuItems: next });
    log('update', `main_${TENANT}.menuItems\n      from ${JSON.stringify(current)}\n      to   ${JSON.stringify(next)}`);
  } else console.log(`  ok             main_${TENANT}`);

  // 3. hidden rows
  const cfgRef = db.collection('app-config').doc(TENANT);
  const hidden = (await cfgRef.get()).data()?.hiddenMenuKeys ?? [];
  const nextHidden = [...hidden, ...HIDE.filter(k => !hidden.includes(k))];
  if (nextHidden.length !== hidden.length) {
    if (apply) await cfgRef.update({ hiddenMenuKeys: nextHidden });
    log('update', `app-config/${TENANT}.hiddenMenuKeys → ${JSON.stringify(nextHidden)}`);
  } else console.log(`  ok             app-config/${TENANT}.hiddenMenuKeys`);
}

main().catch(err => { console.error(err.message ?? err); process.exit(1); });
