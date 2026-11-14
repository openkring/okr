/**
 * ONE-TIME RESET of travel-journal test content (spec 1.154 §11). All existing journal content is test data and is
 * cleared, not converted: the phase-1 block records (`type: 'article'` sections, clips under `properties.images`,
 * `blockKind: 'video'`) must not reach guests once the section release is out.
 *
 * WHAT GOES, per journal key given:
 *   - journals/{jk}/footprints, sections, images, comments, reactions   (all documents)
 *   - journals/{jk}/private/*  EXCEPT `peer` (peer secret) and `guestLinks` (guest links stay valid)
 *   - journal-changes where journalKey == jk  EXCEPT entity == 'journal' (they ARE the journal doc: title, authors,
 *     cover are materialised from them; deleting them would let the next apply archive the journal)
 *   - journal-books/{jk}  (the book's edits and export state)
 *   - private bucket `<project>-private`: every object under tenant/<t>/journal/<jk>/ for each tenant of the journal
 *     (photos, posters, clips, print files, book PDFs) — the path convention of `storagePath` in
 *     libs/travel/journal/util/src/lib/journal-server.util.ts
 * WHAT STAYS: the journals/{jk} doc itself, private/peer, private/guestLinks, the journal's own change records,
 * journal-locks (ephemeral, they expire). Subcollections not named above are only reported, never deleted.
 * The iPads clear their local store on their own (journalSchema < 2, JournalDb); a device with unsent records loses them.
 *
 * Journals may carry several tenants (deleting-models skill). This is a hard delete of test content on purpose; it is
 * the only way these rows are removed, so run it for the named test journals only.
 *
 * Usage:
 *   node scripts/journal-reset.mjs                       # read-only: lists the journals and their keys
 *   node scripts/journal-reset.mjs jk1 jk2               # DRY RUN for those journals (default)
 *   node scripts/journal-reset.mjs jk1 jk2 --apply       # deletes (Bruno only)
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS). Project: GCLOUD_PROJECT or bkaiser-org.
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const apply = process.argv.includes('--apply');
const keys = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const projectId = process.env.GCLOUD_PROJECT ?? 'bkaiser-org';
const BATCH_SIZE = 400;

const CLEARED = ['footprints', 'sections', 'images', 'comments', 'reactions'];
const KEPT_PRIVATE = new Set(['peer', 'guestLinks']);

async function deleteRefs(db, refs) {
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function resetJournal(db, bucket, jk) {
  const ref = db.collection('journals').doc(jk);
  const journal = await ref.get();
  if (!journal.exists) { console.log(`${jk}: no such journal — skipped`); return; }
  const tenants = journal.data().tenants ?? [];
  console.log(`\n${jk}  "${journal.data().title ?? ''}"  tenants: ${tenants.join(',') || '(none)'}`);

  const refs = [];
  for (const sub of await ref.listCollections()) {
    const snap = await sub.get();
    if (CLEARED.includes(sub.id)) {
      refs.push(...snap.docs.map((d) => d.ref));
      console.log(`  ${sub.id.padEnd(12)} ${snap.size} to delete`);
    } else if (sub.id === 'private') {
      const doomed = snap.docs.filter((d) => !KEPT_PRIVATE.has(d.id));
      refs.push(...doomed.map((d) => d.ref));
      console.log(`  private      ${doomed.length} to delete, ${snap.size - doomed.length} kept (${[...KEPT_PRIVATE].join(', ')})`);
    } else {
      console.log(`  ${sub.id.padEnd(12)} ${snap.size} NOT TOUCHED (not in the reset list)`);
    }
  }

  const changes = await db.collection('journal-changes').where('journalKey', '==', jk).get();
  const doomedChanges = changes.docs.filter((d) => d.data().entity !== 'journal');
  refs.push(...doomedChanges.map((d) => d.ref));
  console.log(`  journal-changes ${doomedChanges.length} to delete, ${changes.size - doomedChanges.length} kept (entity 'journal')`);

  const book = await db.collection('journal-books').doc(jk).get();
  if (book.exists) refs.push(book.ref);
  console.log(`  journal-books   ${book.exists ? 1 : 0} to delete`);

  const files = [];
  for (const tenant of tenants) {
    const [objects] = await bucket.getFiles({ prefix: `tenant/${tenant}/journal/${jk}/` });
    files.push(...objects);
  }
  const bytes = files.reduce((n, f) => n + Number(f.metadata.size ?? 0), 0);
  console.log(`  bucket ${bucket.name}: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB to delete`);

  if (!apply) return;
  await deleteRefs(db, refs);
  for (const file of files) await file.delete({ ignoreNotFound: true });
  console.log(`  DELETED ${refs.length} documents, ${files.length} files`);
}

async function main() {
  if (!getApps().length) initializeApp({ projectId });
  const db = getFirestore();
  const bucket = getStorage().bucket(`${projectId}-private`);

  if (keys.length === 0) {
    const snap = await db.collection('journals').get();
    console.log(`READ ONLY — ${snap.size} journals in ${projectId}; pass keys to dry-run a reset\n`);
    for (const d of snap.docs) {
      const x = d.data();
      console.log(`  ${d.id}  "${x.title ?? ''}"  tenants: ${(x.tenants ?? []).join(',')}${x.isArchived ? '  (archived)' : ''}`);
    }
    return;
  }
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${projectId} — ${keys.length} journals`);
  for (const jk of keys) await resetJournal(db, bucket, jk);
  if (!apply) console.log('\nRe-run with --apply to delete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
