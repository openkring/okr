/**
 * One-time / idempotent rebuild of the `persons.index` search string (privacy spec 1.19).
 *
 * WHY: the index is only recomputed when a person is written. Persons created before
 * Phase 3 still carry the OLD index format in production — including `dob:YYYYMMDD`
 * (the exact date of birth) and the legacy `c:<city>` / `g:<gender>` elements. `persons`
 * is readable by every authenticated member of a shared tenant (`allow read: if tenantRead()`),
 * so the stripped dob is still handed to every member through the index string. The rules
 * reject a `dateOfBirth` FIELD but cannot see it embedded in `index`.
 *
 * WHAT: recomputes every person's index as `n:lastName z:favZipCode fn:firstName bx:bexioId`.
 * Nothing else on the document is touched, and a person whose index already matches is skipped.
 *
 * AUTHORITATIVE LOGIC: getPersonIndex (libs/subject/person/util/src/lib/person.util.ts),
 * mirrored by buildPersonIndex (apps/functions/src/person/index.ts). This script is a third
 * mirror for standalone execution — keep the field order in sync with those two.
 *
 * Run with:  node scripts/rebuild-person-index.mjs --dry     (inspect first)
 *            node scripts/rebuild-person-index.mjs           (execute)
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

/** mirror of getPersonIndex — dob/city/gender deliberately absent (spec 1.19 Phase 3) */
function buildPersonIndex(p) {
  let index = '';
  index = addIndexElement(index, 'n', p.lastName ?? '');
  index = addIndexElement(index, 'z', p.favZipCode ?? '');
  index = addIndexElement(index, 'fn', p.firstName ?? '');
  index = addIndexElement(index, 'bx', p.bexioId ?? '');
  return index;
}

const stats = { seen: 0, rewritten: 0, withDob: 0, unchanged: 0 };
const samples = [];

let last;
for (;;) {
  let q = db.collection('persons').orderBy('__name__').limit(BATCH);
  if (last) q = q.startAfter(last);
  const snap = await q.get();
  if (snap.empty) break;
  for (const doc of snap.docs) {
    const data = doc.data();
    const current = typeof data.index === 'string' ? data.index : '';
    const next = buildPersonIndex(data);
    stats.seen++;
    if (/(^|\s)dob:/.test(current)) stats.withDob++;
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

console.log(`Rebuilding persons.index${DRY_RUN ? ' (DRY RUN — no writes)' : ''} ...`);
if (samples.length) console.log(`Samples:\n${samples.join('\n')}`);
console.log(
  `Done: ${stats.seen} persons seen, ${stats.withDob} carried a dob in the index, ` +
    `${stats.rewritten} ${DRY_RUN ? 'would be' : ''} rewritten, ${stats.unchanged} already current.`,
);
