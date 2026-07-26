/**
 * One-time strip migration for privacy spec 1.19 Phase 4 (Stage C, Task C3).
 * DELETES the replicated PII fields from the parent documents — the addresses
 * vault and the address-directory projection are the only sources afterwards:
 *
 *   1. persons         -> FieldValue.delete() ssnId, dateOfBirth, favEmail, favPhone
 *   2. orgs            -> FieldValue.delete() favEmail, favPhone
 *   3. memberships     -> FieldValue.delete() memberDateOfBirth
 *   4. scs-memberfees  -> FieldValue.delete() memberDateOfBirth
 *
 * PRECONDITION (checked, aborts otherwise): every person carrying ssnId or
 * dateOfBirth has the matching ssn/dob vault address (else the strip would
 * destroy data the Phase 3 backfill missed).
 *
 * PRECONDITION (manual, user-gated): minVersion >= R2 (7.6.0) is enforced in
 * app-version, so no active client still writes/reads the stripped fields.
 *
 * Idempotent: re-running skips docs that no longer carry the fields.
 *
 * Run with:  node scripts/strip-sensitive-data.mjs --dry-run   (inspect first)
 *            node scripts/strip-sensitive-data.mjs             (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dry');

/** Deletes the given fields from every doc of a collection that carries at least one of them. */
async function stripFields(collectionName, fields) {
  const snap = await db.collection(collectionName).get();
  let stripped = 0;
  let batch = db.batch();
  let pending = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const present = fields.filter((f) => data[f] !== undefined);
    if (present.length === 0) continue;
    if (!DRY_RUN) {
      const update = {};
      for (const f of present) update[f] = FieldValue.delete();
      batch.update(doc.ref, update);
      pending++;
      if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    stripped++;
  }
  if (!DRY_RUN && pending > 0) await batch.commit();
  console.log(`${collectionName}: ${snap.size} docs scanned, ${stripped} ${DRY_RUN ? 'would be ' : ''}stripped of [${fields.join(', ')}]`);
  return stripped;
}

/**
 * Abort-check: every person that still carries ssnId/dateOfBirth must have the
 * matching vault address — otherwise the Phase 3 backfill has a gap and the
 * strip would destroy the only copy.
 */
async function checkVaultCoverage(personsSnap) {
  const vaultSnap = await db.collection('addresses')
    .where('addressChannel', 'in', ['ssn', 'dob']).get();
  const vault = new Set();   // 'person.<id>|ssn'
  for (const doc of vaultSnap.docs) {
    const a = doc.data();
    if (a[a.addressChannel]) vault.add(`${a.parentKey}|${a.addressChannel}`);
  }

  const gaps = [];
  for (const doc of personsSnap.docs) {
    const p = doc.data();
    const parentKey = `person.${doc.id}`;
    if (p.ssnId && !vault.has(`${parentKey}|ssn`)) gaps.push(`${parentKey}: ssnId '${'*'.repeat(4)}' has no ssn vault doc`);
    if (p.dateOfBirth && !vault.has(`${parentKey}|dob`)) gaps.push(`${parentKey}: dateOfBirth has no dob vault doc`);
  }
  return gaps;
}

async function main() {
  const personsSnap = await db.collection('persons').get();
  console.log(`Found ${personsSnap.size} persons. Checking vault coverage...`);

  const gaps = await checkVaultCoverage(personsSnap);
  if (gaps.length > 0) {
    console.error(`ABORT: ${gaps.length} person(s) carry ssnId/dateOfBirth without a vault doc (backfill gap):`);
    for (const g of gaps) console.error('  ' + g);
    console.error('Run scripts/migrate-sensitive-data.mjs first, then retry.');
    process.exit(2);
  }
  console.log('Vault coverage OK — every person ssnId/dateOfBirth has its vault doc.');

  const persons = await stripFields('persons', ['ssnId', 'dateOfBirth', 'favEmail', 'favPhone']);
  const orgs = await stripFields('orgs', ['favEmail', 'favPhone']);
  const memberships = await stripFields('memberships', ['memberDateOfBirth']);
  const memberfees = await stripFields('scs-memberfees', ['memberDateOfBirth']);

  console.log('---');
  console.log(`persons stripped:        ${persons}`);
  console.log(`orgs stripped:           ${orgs}`);
  console.log(`memberships stripped:    ${memberships}`);
  console.log(`scs-memberfees stripped: ${memberfees}`);
  if (DRY_RUN) console.log('(dry run — no writes performed)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
