/**
 * One-time migration of the date of death into the vault (privacy spec 1.19, D-P4-7).
 * Local admin-SDK twin of the `migrateDateOfDeath` callable — same idempotent logic,
 * run directly against production Firestore (no AppCheck/auth ceremony needed):
 *
 *   1. persons.dateOfDeath          -> addresses doc { addressChannel: 'dod', dod, parentKey: 'person.<id>' }
 *                                      + persons.isDeceased + persons.deathYear (YYYY), source field DELETED
 *   2. memberships.memberDateOfDeath -> memberIsDeceased + memberDeathYear (YYYY), source field DELETED
 *
 * DESTRUCTIVE: both source fields are removed. The value survives in the vault `dod`
 * address, but only a client that reads the vault can show it.
 *
 * PRECONDITION: all clients on >= 7.8.0 (the dod-aware client). Releasing v7.8.0 with
 * app-version.minVersion = 7.8.0 is what enforces this — an older client reads
 * persons.dateOfDeath directly and would show empty "Verstorbene" lists after this run.
 *
 * SAFETY: the source field is deleted only after the dod vault address has been written
 * AND read back. A person whose vault write fails keeps their dateOfDeath and is reported.
 *
 * Re-runnable: every write is skipped when the target already matches.
 *
 * Run with:  node scripts/migrate-date-of-death.mjs --dry     (inspect first)
 *            node scripts/migrate-date-of-death.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');
const tag = DRY_RUN ? '[dry] ' : '';

/** YYYY from a StoreDate (yyyymmdd) — mirror of getStoreDateYear in shared-util-core. */
function getStoreDateYear(storeDate) {
  if (!storeDate || storeDate.length !== 8) return '';
  return storeDate.substring(0, 4);
}

/**
 * Upsert the person's `dod` vault address and return true once a LIVE (non-archived)
 * doc holds the value.
 *
 * Deliberately archive-aware, unlike the callable's upsertScalar: that one takes the
 * first match regardless of `isArchived`, so an archived dod doc would be updated and
 * left archived — the vault would still have no live value, and resyncVaultReplicas
 * would then clear isDeceased again. Prefer a live doc; revive an archived one.
 */
async function upsertDod(parentKey, dod, tenants) {
  const existing = await db.collection('addresses')
    .where('parentKey', '==', parentKey)
    .where('addressChannel', '==', 'dod')
    .get();
  const docs = existing.docs;
  const live = docs.find((d) => d.data().isArchived !== true);

  if (docs.length > 1) {
    console.warn(`  ! ${parentKey} has ${docs.length} dod addresses (${docs.map((d) => d.id).join(', ')})`);
  }

  if (live) {
    if (live.data().dod === dod) return true;
    console.log(`${tag}update dod address ${live.id} for ${parentKey} -> ${dod}`);
    if (!DRY_RUN) await live.ref.update({ dod });
    return true;
  }

  if (docs.length) {
    const archived = docs[0];
    console.log(`${tag}revive archived dod address ${archived.id} for ${parentKey} -> ${dod}`);
    if (!DRY_RUN) await archived.ref.update({ dod, isArchived: false });
    return true;
  }

  console.log(`${tag}create dod address for ${parentKey} -> ${dod}`);
  if (DRY_RUN) return true;
  await db.collection('addresses').add({
    addressChannel: 'dod',
    dod,
    parentKey,
    isFavorite: false,
    isArchived: false,
    tenants: Array.isArray(tenants) && tenants.length ? tenants : ['system'],
    index: '',
  });
  return true;
}

/** Read back the live dod value from the vault — the precondition for deleting the source. */
async function readLiveDod(parentKey) {
  const snap = await db.collection('addresses')
    .where('parentKey', '==', parentKey)
    .where('addressChannel', '==', 'dod')
    .get();
  const live = snap.docs.find((d) => d.data().isArchived !== true);
  return live?.data().dod ?? '';
}

async function migratePersons() {
  const snap = await db.collection('persons').get();
  const result = { scanned: snap.size, vaultWrites: 0, flagged: 0, stripped: 0, skipped: [] };

  for (const doc of snap.docs) {
    const p = doc.data();
    const hasField = Object.prototype.hasOwnProperty.call(p, 'dateOfDeath');
    const dod = typeof p.dateOfDeath === 'string' ? p.dateOfDeath : '';
    const isDeceased = dod.length > 0;
    const deathYear = getStoreDateYear(dod);
    const parentKey = `person.${doc.id}`;

    if (isDeceased) {
      if (await upsertDod(parentKey, dod, p.tenants)) result.vaultWrites++;
      // never delete the source before the vault demonstrably holds the value
      if (!DRY_RUN && (await readLiveDod(parentKey)) !== dod) {
        console.error(`  ✖ ${parentKey}: vault read-back failed — keeping dateOfDeath`);
        result.skipped.push(doc.id);
        continue;
      }
    }

    if (!hasField && p.isDeceased === isDeceased && p.deathYear === deathYear) continue;

    const update = { isDeceased, deathYear };
    if (hasField) update.dateOfDeath = FieldValue.delete();
    console.log(`${tag}person ${doc.id}: isDeceased=${isDeceased} deathYear='${deathYear}'${hasField ? ' (strip dateOfDeath)' : ''}`);
    if (!DRY_RUN) await doc.ref.update(update);
    result.flagged++;
    if (hasField) result.stripped++;
  }
  return result;
}

async function migrateMemberships() {
  const snap = await db.collection('memberships').get();
  const result = { scanned: snap.size, flagged: 0, stripped: 0 };

  for (const doc of snap.docs) {
    const m = doc.data();
    const hasField = Object.prototype.hasOwnProperty.call(m, 'memberDateOfDeath');
    const dod = typeof m.memberDateOfDeath === 'string' ? m.memberDateOfDeath : '';
    const isDeceased = dod.length > 0;
    const deathYear = getStoreDateYear(dod);

    if (!hasField && m.memberIsDeceased === isDeceased && m.memberDeathYear === deathYear) continue;

    const update = { memberIsDeceased: isDeceased, memberDeathYear: deathYear };
    if (hasField) update.memberDateOfDeath = FieldValue.delete();
    console.log(`${tag}membership ${doc.id}: memberIsDeceased=${isDeceased} memberDeathYear='${deathYear}'${hasField ? ' (strip memberDateOfDeath)' : ''}`);
    if (!DRY_RUN) await doc.ref.update(update);
    result.flagged++;
    if (hasField) result.stripped++;
  }
  return result;
}

async function main() {
  console.log(`migrate-date-of-death${DRY_RUN ? ' (DRY RUN)' : ''} — project bkaiser-org\n`);

  const persons = await migratePersons();
  const memberships = await migrateMemberships();

  console.log('---');
  console.log(`persons scanned:          ${persons.scanned}`);
  console.log(`dod vault writes:         ${persons.vaultWrites}`);
  console.log(`persons flagged:          ${persons.flagged}`);
  console.log(`persons dateOfDeath removed:      ${persons.stripped}`);
  console.log(`memberships scanned:      ${memberships.scanned}`);
  console.log(`memberships flagged:      ${memberships.flagged}`);
  console.log(`memberships memberDateOfDeath removed: ${memberships.stripped}`);
  if (persons.skipped.length) {
    console.error(`\n✖ ${persons.skipped.length} person(s) SKIPPED (vault read-back failed): ${persons.skipped.join(', ')}`);
    console.error('  Their dateOfDeath was NOT removed — investigate, then re-run.');
  }
  if (DRY_RUN) console.log('\n(dry run — no writes performed)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
