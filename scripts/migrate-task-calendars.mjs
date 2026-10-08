/**
 * One-time / idempotent migration of TaskModel.calendars[] (spec 3.14 Phase 2).
 *
 * WHY: until Phase 2 the client derived TaskModel.shareKey from calendars[] (a group key sat in
 * calendars next to the tenant id). Phase 2 makes the client write shareKey directly and stops
 * reading calendars[] as a scope. Group and tenant ids left in calendars[] would now be dead
 * weight that reads like a scope, so they are stripped here.
 *
 * WHAT: for every task, computes the scope the task has today (the 4.106 derivation, so nobody
 * gains or loses access), writes it to shareKey when it differs, and removes tenant ids, group ids
 * and that scope key from calendars[]. Calendar keys that are neither a tenant nor a group are
 * logged and kept (they could be a real calendar).
 *
 * Run with:  node scripts/migrate-task-calendars.mjs --dry     (inspect first)
 *            node scripts/migrate-task-calendars.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');

const groupKeys = new Set((await db.collection('groups').get()).docs.map(d => d.id));
const stats = { seen: 0, updated: 0, shareKeyChanged: 0, calendarsStripped: 0, leftovers: 0 };
const samples = [];

const snap = await db.collection('tasks').get();
for (const doc of snap.docs) {
  stats.seen++;
  const t = doc.data();
  const tenants = t.tenants ?? [];
  const calendars = t.calendars ?? [];
  const relatedKey = t.relatedKey ?? '';
  // the scope this task has today — identical to the 4.106 derivation, so nobody gains or loses access
  const shareKey = relatedKey.startsWith('meeting.') ? relatedKey
    : (t.shareKey || calendars.find(c => !tenants.includes(c)) || '');
  const kept = calendars.filter(c => !tenants.includes(c) && !groupKeys.has(c) && c !== shareKey);
  if (kept.length) {
    stats.leftovers++;
    console.log(`keep ${doc.id}: unknown calendar keys ${kept.join(',')}`);
  }
  const patch = {};
  if (shareKey !== (t.shareKey ?? '')) { patch.shareKey = shareKey; stats.shareKeyChanged++; }
  if (kept.length !== calendars.length) { patch.calendars = kept; stats.calendarsStripped++; }
  if (Object.keys(patch).length) {
    stats.updated++;
    if (samples.length < 5) samples.push({ id: doc.id, tenants, calendars, from: t.shareKey, to: shareKey, calendarsTo: kept });
    if (!DRY_RUN) await doc.ref.update(patch);
  }
}

console.log(DRY_RUN ? '[DRY RUN] no writes' : 'written');
console.log(stats);
console.log(samples);
