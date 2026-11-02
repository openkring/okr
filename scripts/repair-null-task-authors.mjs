/**
 * One-time / idempotent repair of tasks whose `author` is stored as null.
 *
 * WHY: the OCR review task (apps/functions/src/ocr/index.ts createReviewTask) and the first version of
 * the course end task wrote `author: null`. The tasks rule `taskAuthorKept()` reads
 * `author.get('key', '')` on every update; `get('author', {})` only defaults an ABSENT field, so a
 * present null makes the rule error and the update is denied (403). Only privileged users skip that
 * check, so a non-privileged assignee (typically the treasurer) cannot work their own task.
 * The writers now stamp SYSTEM_AUTHOR (apps/functions/src/workflow/activity.ts); this script fixes
 * the documents already written.
 *
 * WHAT: every task with `author == null` gets the system avatar as author and a rebuilt `index`.
 * Nothing else is touched. `author` and `index` are not read by `onTaskWritten`'s push, badge or
 * diary decisions (assignee/completionDate/isArchived/state), so no notification fires.
 * Tasks WITHOUT an author field are fine (the rule defaults them) and are left alone.
 *
 * AUTHORITATIVE LOGIC: SYSTEM_AUTHOR (apps/functions/src/workflow/activity.ts) and getTaskIndex
 * (libs/project/task/util/src/lib/task.util.ts) — mirrored below.
 *
 * Run with:  node scripts/repair-null-task-authors.mjs           (dry run — the default, no writes)
 *            node scripts/repair-null-task-authors.mjs --write   (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const WRITE = process.argv.includes('--write');

/** mirror of SYSTEM_AUTHOR (apps/functions/src/workflow/activity.ts) */
const SYSTEM_AUTHOR = { key: '', name1: 'System', name2: '', modelType: 'user', type: '', subType: '', label: 'System' };

/** mirror of addIndexElement (@okr/shared-util-core) */
function addIndexElement(index, key, value) {
  if (!key || key.length === 0) return index;
  const v = value ?? '';
  if (typeof v === 'string' && (v.length === 0 || (v.length === 1 && v.startsWith(' ')))) return index;
  return index.length === 0 ? `${key}:${v}` : `${index} ${key}:${v}`;
}

/** mirror of getTaskIndex (@okr/project-task-util) */
function buildTaskIndex(t) {
  let index = '';
  index = addIndexElement(index, 'n', t.name ?? '');
  if (t.author) {
    index = addIndexElement(index, 'an', t.author.name1 + ' ' + t.author.name2);
    index = addIndexElement(index, 'ak', t.author.key);
  }
  if (t.assignee) {
    index = addIndexElement(index, 'asn', t.assignee.name1 + ' ' + t.assignee.name2);
    index = addIndexElement(index, 'ask', t.assignee.key);
  }
  return index;
}

const isOpen = (t) => !t.isArchived && (t.completionDate ?? '') === '' && t.state !== 'done';

const stats = { found: 0, open: 0, repaired: 0 };
const byTenant = {};
const samples = [];

// equality with null matches only a PRESENT null field, never a missing one
const snap = await db.collection('tasks').where('author', '==', null).get();
for (const doc of snap.docs) {
  const task = doc.data();
  stats.found++;
  if (isOpen(task)) stats.open++;
  const tenant = (task.tenants ?? []).join(',') || '(none)';
  byTenant[tenant] = (byTenant[tenant] ?? 0) + 1;
  if (samples.length < 10) {
    samples.push({ id: doc.id, tenant, name: task.name, assignee: task.assignee?.key ?? '', open: isOpen(task) });
  }
  const patch = { author: SYSTEM_AUTHOR, index: buildTaskIndex({ ...task, author: SYSTEM_AUTHOR }) };
  if (WRITE) {
    await doc.ref.update(patch);
    stats.repaired++;
  }
}

console.log(WRITE ? 'written' : '[DRY RUN] no writes — pass --write to execute');
console.log(stats);
console.log(byTenant);
console.log(samples);
