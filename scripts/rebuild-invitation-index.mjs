/**
 * Idempotent rebuild of the `invitations.index` search string.
 *
 * WHY: the index is only recomputed when an invitation is written. Documents created before
 * 2026-08 carry one of the two legacy formats — `ik:<key>, ck:<key>, n:<lastName>, d:<date>`
 * (written inline by InvitationStore.invitePerson) or `d:<date> ir:<inviter> ie:<invitee>` —
 * so the list filter (`i:` / `d:` / `n:`) never matches them.
 *
 * WHAT: recomputes every invitation's index as `i:<invitee name> d:<date> n:<event name>`.
 * Nothing else on the document is touched, and an invitation whose index already matches is
 * skipped.
 *
 * AUTHORITATIVE LOGIC: getInvitationIndex
 * (libs/relationship/invitation/util/src/lib/invitation.util.ts) — keep the field order in sync.
 *
 * Run with:  node scripts/rebuild-invitation-index.mjs --dry     (inspect first)
 *            node scripts/rebuild-invitation-index.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');
const BATCH = 400;

/** mirror of addIndexElement (@okr/shared-util-core) */
function addIndexElement(index, key, value) {
  if (!key || key.length === 0) return index;
  const v = value ?? '';
  if (typeof v === 'string' && (v.length === 0 || (v.length === 1 && v.startsWith(' ')))) return index;
  return index.length === 0 ? `${key}:${v}` : `${index} ${key}:${v}`;
}

/** mirror of getInvitationIndex */
function buildInvitationIndex(inv) {
  let index = '';
  index = addIndexElement(index, 'i', `${inv.inviteeFirstName ?? ''} ${inv.inviteeLastName ?? ''}`.trim());
  index = addIndexElement(index, 'd', inv.date ?? '');
  index = addIndexElement(index, 'n', inv.name ?? '');
  return index;
}

const stats = { seen: 0, rewritten: 0, unchanged: 0 };
const samples = [];

let last;
for (;;) {
  let q = db.collection('invitations').orderBy('__name__').limit(BATCH);
  if (last) q = q.startAfter(last);
  const snap = await q.get();
  if (snap.empty) break;
  for (const doc of snap.docs) {
    const data = doc.data();
    const current = typeof data.index === 'string' ? data.index : '';
    const next = buildInvitationIndex(data);
    stats.seen++;
    if (current === next) {
      stats.unchanged++;
      continue;
    }
    stats.rewritten++;
    if (samples.length < 5) samples.push(`  ${doc.id}\n    old: ${current}\n    new: ${next}`);
    if (!DRY_RUN) await doc.ref.update({ index: next });
  }
  last = snap.docs[snap.docs.length - 1].id;
  if (snap.size < BATCH) break;
}

console.log(`Rebuilding invitations.index${DRY_RUN ? ' (DRY RUN — no writes)' : ''} ...`);
if (samples.length) console.log(`Samples:\n${samples.join('\n')}`);
console.log(
  `Done: ${stats.seen} invitations seen, ${stats.rewritten} ${DRY_RUN ? 'would be' : ''} rewritten, ` +
    `${stats.unchanged} already current.`,
);
