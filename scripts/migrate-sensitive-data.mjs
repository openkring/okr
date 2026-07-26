/**
 * One-time backfill for privacy spec 1.19 Phase 3 (addresses = PII vault).
 * Local admin-SDK twin of the `migrateSensitiveData` callable — same idempotent logic,
 * run directly against production Firestore (no AppCheck/auth ceremony needed):
 *
 *   1. persons.ssnId        -> addresses doc { addressChannel: 'ssn',  ssn,  parentKey: 'person.<id>' }
 *   2. persons.dateOfBirth  -> addresses doc { addressChannel: 'dob',  dob,  parentKey: 'person.<id>' }
 *   3. memberships          -> memberBirthYear (YYYY) from memberDateOfBirth
 *   4. scs-memberfees       -> memberBirthYear (YYYY) from memberDateOfBirth
 *
 * NON-DESTRUCTIVE: nothing is deleted or stripped (that is Phase 4). Re-runnable:
 * every write is skipped when the target already matches.
 *
 * PRECONDITION: all clients on >= 7.5.0 (sensitive-channel display filter), else the
 * new ssn/dob docs render as empty rows in the contact accordion of older clients.
 *
 * Run with:  node scripts/migrate-sensitive-data.mjs --dry     (inspect first)
 *            node scripts/migrate-sensitive-data.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');

/** YYYY from a StoreDate (yyyymmdd) — mirror of getBirthYear in shared-util-core. */
function getBirthYear(dateOfBirth) {
  if (!dateOfBirth || dateOfBirth.length !== 8) return '';
  return dateOfBirth.substring(0, 4);
}

/** Upsert one ssn/dob vault address; returns 'created' | 'updated' | null (skipped). */
async function upsertScalar(parentKey, channel, value, tenants) {
  if (!value) return null;
  const existing = await db.collection('addresses')
    .where('parentKey', '==', parentKey)
    .where('addressChannel', '==', channel)
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    if (doc.data()[channel] === value) return null;
    console.log(`${DRY_RUN ? '[dry] ' : ''}update ${channel} address ${doc.id} for ${parentKey}`);
    if (!DRY_RUN) await doc.ref.update({ [channel]: value });
    return 'updated';
  }
  console.log(`${DRY_RUN ? '[dry] ' : ''}create ${channel} address for ${parentKey}`);
  if (!DRY_RUN) {
    await db.collection('addresses').add({
      addressChannel: channel,
      [channel]: value,
      parentKey,
      isFavorite: false,
      isArchived: false,
      tenants: Array.isArray(tenants) && tenants.length ? tenants : ['system'],
      index: '',
    });
  }
  return 'created';
}

/** Set memberBirthYear (YYYY) on every doc of a collection that has memberDateOfBirth. */
async function backfillBirthYear(collectionName) {
  const snap = await db.collection(collectionName).get();
  let updated = 0;
  let batch = db.batch();
  let pending = 0;
  for (const doc of snap.docs) {
    const year = getBirthYear(doc.data().memberDateOfBirth);
    if (!year || doc.data().memberBirthYear === year) continue;
    if (!DRY_RUN) {
      batch.update(doc.ref, { memberBirthYear: year });
      pending++;
      if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    updated++;
  }
  if (!DRY_RUN && pending > 0) await batch.commit();
  console.log(`${collectionName}: ${snap.size} docs, ${updated} memberBirthYear ${DRY_RUN ? 'would be ' : ''}set`);
  return updated;
}

async function main() {
  // 1+2: persons -> ssn/dob vault addresses
  const personsSnap = await db.collection('persons').get();
  console.log(`Found ${personsSnap.size} persons.`);
  let ssnCreated = 0;
  let dobCreated = 0;
  for (const doc of personsSnap.docs) {
    const p = doc.data();
    const parentKey = `person.${doc.id}`;
    if (await upsertScalar(parentKey, 'ssn', p.ssnId ?? '', p.tenants)) ssnCreated++;
    if (await upsertScalar(parentKey, 'dob', p.dateOfBirth ?? '', p.tenants)) dobCreated++;
  }

  // 3+4: birth-year replicas
  const memberships = await backfillBirthYear('memberships');
  const memberfees = await backfillBirthYear('scs-memberfees');

  console.log('---');
  console.log(`persons scanned:        ${personsSnap.size}`);
  console.log(`ssn vault writes:       ${ssnCreated}`);
  console.log(`dob vault writes:       ${dobCreated}`);
  console.log(`memberships updated:    ${memberships}`);
  console.log(`scs-memberfees updated: ${memberfees}`);
  if (DRY_RUN) console.log('(dry run — no writes performed)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
