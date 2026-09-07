/**
 * ONE-TIME DATA FIX — sets `membersMayUpload: true` on every existing folder, in every tenant,
 * root folders included.
 *
 * WHY: `firestore.rules`, `match /docs/{id}`, `allow create` gives a non-contentAdmin exactly
 * one branch, and its last condition is
 * `folderData(folderKeys[0]).get('membersMayUpload', false) == true`. The field was added after
 * most folders were created, so it is absent on all of them and the rule's default (`false`)
 * applies — measured before this ran: a collection-wide `where('membersMayUpload','==',true)`
 * returned ZERO documents. A registered member therefore could not upload into ANY folder in
 * ANY tenant; the failure reached the user as "Missing or insufficient permissions" from
 * `FirestoreService.createModel`, after they had already picked their files.
 *
 * WHAT THIS IS NOT: it is not a rules change and not a widening of what members can read. It
 * flips the per-folder opt-in that the rules already honour, to the value the product intends
 * (members contribute photos to the club album). Uploading still requires an authenticated
 * member of the tenant with a `personKey`, and the created document must carry their own
 * `authorKey` — both enforced server-side, by the same rule branch.
 *
 * DELIBERATELY BACKFILL-ONLY. It sets the flag on folders that exist NOW; it does not change
 * `newFolderModel`, so a folder created after this run still starts closed (`false`, the
 * FolderModel default) and an admin opens it in the folder edit form. That keeps the flag
 * meaningful going forward instead of turning it into dead weight — and the folder list route
 * added alongside this script is what makes that form reachable.
 *
 * SAFETY: `membersMayUpload` is the ONLY field written. A folder that already has it `true` is
 * counted and skipped, not rewritten. Archived folders are skipped — reopening uploads into
 * something already retired is not intended. Writes go in batches of 400 (the Firestore cap is
 * 500).
 *
 * TO REVERSE: the same script with --close sets the flag back to `false` on every folder,
 * restoring today's behaviour exactly (the rule reads an absent field and an explicit `false`
 * identically).
 *
 * Usage:
 *   node scripts/backfill-members-may-upload.mjs              # dry run (default)
 *   node scripts/backfill-members-may-upload.mjs --apply      # open uploads
 *   node scripts/backfill-members-may-upload.mjs --close --apply   # undo
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const target = process.argv.includes('--close') ? false : true;
const BATCH_SIZE = 400;

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();

  const snapshot = await db.collection('folders').get();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — membersMayUpload → ${target} · ${snapshot.size} folders in the collection\n`);

  const todo = [];
  const perTenant = {};
  let already = 0;
  let archived = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.isArchived === true) { archived++; continue; }
    if ((data.membersMayUpload === true) === target) { already++; continue; }
    todo.push(doc.ref);
    for (const tenant of data.tenants ?? ['(none)']) {
      perTenant[tenant] = (perTenant[tenant] ?? 0) + 1;
    }
  }

  for (const [tenant, count] of Object.entries(perTenant).sort()) {
    console.log(`  ${tenant.padEnd(8)} ${count}`);
  }
  console.log(`\n  to change: ${todo.length} · already ${target}: ${already} · archived (skipped): ${archived}`);

  if (apply) {
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = db.batch();
      // update(), not set(): only this field is written, everything else is left untouched.
      todo.slice(i, i + BATCH_SIZE).forEach((ref) => batch.update(ref, { membersMayUpload: target }));
      await batch.commit();
      console.log(`  committed ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`);
    }
    console.log(`\nchanged: ${todo.length}`);
  } else {
    console.log('\nRe-run with --apply to write.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
