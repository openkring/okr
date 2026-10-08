/**
 * One-time / idempotent backfill of TaskModel.shareKey (spec 1.72 §4).
 *
 * WHY: shareKey is a denormalised reader scope written on every create/update by
 * getTaskShareKey (@okr/project-task-util) — '' = private (author/assignee/staff only), a group key or
 * 'meeting.<okey>' = readable by the whole tenant. Firestore rules only admit a list query that
 * filters on the field the rule checks, and a query may carry just one array filter (tenants), so
 * `calendars` cannot serve that role directly. Tasks written before this field existed have no
 * shareKey and must be backfilled before the 1.72 rules (and the list queries built on shareKey)
 * can rely on it for every document.
 *
 * WHAT: for every task, computes the mirror of getTaskShareKey below and writes it when it differs
 * from the stored value (including tasks that have no shareKey at all).
 *
 * AUTHORITATIVE LOGIC: getTaskShareKey (libs/project/task/util/src/lib/task-query.util.ts) — mirrored below.
 *
 * Run with:  node scripts/backfill-task-share-key.mjs --dry     (inspect first)
 *            node scripts/backfill-task-share-key.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * IMPORTANT: this script must currently only be run with --dry (production data; the real run is
 * part of the rollout, tracked as a separate task).
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');

/** mirror of getTaskShareKey (@okr/project-task-util) */
function shareKey(t) {
  const relatedKey = t.relatedKey ?? '';
  if (relatedKey.startsWith('meeting.')) return relatedKey;
  const tenants = t.tenants ?? [];
  return (t.calendars ?? []).find(c => !tenants.includes(c)) ?? '';
}

const stats = { seen: 0, updated: 0, shared: 0 };
const samples = [];

const snap = await db.collection('tasks').get();
for (const doc of snap.docs) {
  stats.seen++;
  const task = doc.data();
  const next = shareKey(task);
  if (next) stats.shared++;
  if ((task.shareKey ?? null) === next) continue;
  stats.updated++;
  if (samples.length < 5) samples.push({ id: doc.id, tenants: task.tenants, name: task.name, from: task.shareKey, to: next });
  if (!DRY_RUN) await doc.ref.update({ shareKey: next });
}

console.log(DRY_RUN ? '[DRY RUN] no writes' : 'written');
console.log(stats);
console.log(samples);
