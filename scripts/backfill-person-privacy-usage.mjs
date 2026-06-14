/**
 * One-time backfill: copy the privacy preferences (usage*) from each UserModel onto its
 * linked PersonModel. The usage* fields moved from `users` (not readable by non-privileged
 * members) to `persons` (tenant-readable) so that every member can honor another person's
 * display-privacy preferences. See docs/superpowers/specs/2026-06-14-person-privacy-on-personmodel-design.md
 *
 * Existing person docs have no usage* fields yet, so this copy is non-destructive.
 *
 * Run with:  node scripts/backfill-person-privacy-usage.mjs
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 * Dry run:   node scripts/backfill-person-privacy-usage.mjs --dry
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');
const USAGE_FIELDS = [
  'usageImages',
  'usageDateOfBirth',
  'usagePostalAddress',
  'usageEmail',
  'usagePhone',
  'usageName',
];

async function main() {
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} users.`);

  let updated = 0;
  let skippedNoPerson = 0;
  let skippedMissingPerson = 0;
  let batch = db.batch();
  let pending = 0;

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    const personKey = user.personKey;
    if (!personKey) { skippedNoPerson++; continue; }

    const personRef = db.collection('persons').doc(personKey);
    const personSnap = await personRef.get();
    if (!personSnap.exists) { skippedMissingPerson++; continue; }

    const patch = {};
    for (const field of USAGE_FIELDS) {
      if (typeof user[field] === 'number') patch[field] = user[field];
    }
    if (Object.keys(patch).length === 0) continue;

    console.log(`${DRY_RUN ? '[dry] ' : ''}person ${personKey} <- ${JSON.stringify(patch)}`);
    if (!DRY_RUN) {
      batch.update(personRef, patch);
      pending++;
      if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    updated++;
  }

  if (!DRY_RUN && pending > 0) await batch.commit();

  console.log('---');
  console.log(`Updated persons:        ${updated}`);
  console.log(`Users without person:   ${skippedNoPerson}`);
  console.log(`Linked person missing:  ${skippedMissingPerson}`);
  if (DRY_RUN) console.log('(dry run — no writes performed)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
