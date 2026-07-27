/**
 * Re-derive every degraded-precision vault replica from the persons' LIVE addresses.
 * Local admin-SDK twin of the `resyncVaultReplicas` callable — same idempotent logic,
 * run directly against production Firestore (no AppCheck/auth ceremony needed):
 *
 *   memberships.memberBirthYear                      <- vault 'dob' address (YYYY)
 *   scs-memberfees.memberBirthYear                   <- vault 'dob' address (YYYY)
 *   persons.isDeceased / deathYear                   <- vault 'dod' address
 *   memberships.memberIsDeceased / memberDeathYear   <- vault 'dod' address
 *
 * Why: until 2026-07-27 `onAddressChange` derived these from the changed address
 * document instead of the vault, so archiving a dob/dod address (the app's delete is a
 * SOFT delete) left the replica populated forever, and duplicate scalar docs let the
 * last write win. The fixed trigger only repairs a person on their NEXT address write;
 * this sweeps the rest.
 *
 * ⚠️ PRECONDITION: `migrate-date-of-death.mjs` MUST have completed first. A person with
 * no live dod address is treated as NOT deceased, so running this against un-migrated
 * data would clear isDeceased/deathYear for everyone whose date of death still sits on
 * the legacy persons.dateOfDeath field.
 *
 * Re-runnable: every write is skipped when the target already matches.
 *
 * Run with:  node scripts/resync-vault-replicas.mjs --dry     (inspect first)
 *            node scripts/resync-vault-replicas.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
 * The parent's addresses, split into live (archived excluded) and the raw set.
 * The raw set is what lets the backfill tell "this dob was deleted" (an archived doc
 * exists) from "this person never had a dob in the vault" (no doc at all) — see
 * shouldClear below.
 */
async function getAddresses(parentKey) {
  const snap = await db.collection('addresses').where('parentKey', '==', parentKey).get();
  const all = snap.docs.map((d) => ({ ...d.data(), okey: d.id }));
  return { all, live: all.filter((a) => a.isArchived !== true) };
}

/**
 * May this backfill clear a replica down to ''?
 *
 * ONLY when the vault shows evidence the value was deleted — i.e. an (archived) doc of
 * that channel exists. A person with NO doc of the channel at all never had the value in
 * the vault, so their replica is the ONLY surviving copy: memberships/fees were seeded
 * from the legacy memberDateOfBirth, which Phase 4 stripped. Clearing those would destroy
 * the birth year, not repair staleness.
 *
 * The trigger is deliberately NOT guarded this way: there, an empty vault means the last
 * address was just deleted, and clearing is exactly the point.
 */
function shouldClear(allAddresses, channel) {
  return allAddresses.some((a) => a.addressChannel === channel);
}

/**
 * The value of a sensitive scalar channel in the vault, '' when absent.
 * Mirror of getScalarChannelValue: deterministic by okey, warns on duplicates.
 */
function getScalarChannelValue(addresses, channel) {
  const candidates = addresses
    .filter((a) => a.addressChannel === channel && (a[channel] ?? '') !== '')
    .sort((a, b) => (a.okey ?? '').localeCompare(b.okey ?? ''));
  if (candidates.length > 1) {
    console.warn(`  ! ${candidates.length} '${channel}' addresses for ${candidates[0].parentKey} — using ${candidates[0].okey}`);
  }
  return candidates[0]?.[channel] ?? '';
}

async function main() {
  console.log(`resync-vault-replicas${DRY_RUN ? ' (DRY RUN)' : ''} — project bkaiser-org\n`);

  const personsSnap = await db.collection('persons').get();

  // index the relation collections once — one full scan beats 658 * 2 queries
  const membershipsSnap = await db.collection('memberships').get();
  const feesSnap = await db.collection('scs-memberfees').get();
  const membershipsByPerson = new Map();
  for (const doc of membershipsSnap.docs) {
    const m = doc.data();
    if (m.memberModelType !== 'person') continue;
    const list = membershipsByPerson.get(m.memberKey) ?? [];
    list.push(doc);
    membershipsByPerson.set(m.memberKey, list);
  }
  const feesByPerson = new Map();
  for (const doc of feesSnap.docs) {
    const f = doc.data();
    if (f.member?.modelType !== 'person') continue;
    const list = feesByPerson.get(f.member.key) ?? [];
    list.push(doc);
    feesByPerson.set(f.member.key, list);
  }

  const result = { persons: personsSnap.size, personWrites: 0, membershipWrites: 0, feeWrites: 0, protected: 0 };

  for (const personDoc of personsSnap.docs) {
    const personId = personDoc.id;
    const { all, live } = await getAddresses(`person.${personId}`);

    const birthYear = getStoreDateYear(getScalarChannelValue(live, 'dob'));
    const dod = getScalarChannelValue(live, 'dod');
    const isDeceased = dod.length > 0;
    const deathYear = getStoreDateYear(dod);

    // never clear a replica the vault has no record of ever holding (see shouldClear)
    const mayClearDob = shouldClear(all, 'dob');
    const mayClearDod = shouldClear(all, 'dod');
    const keepDob = !birthYear && !mayClearDob;
    const keepDod = !isDeceased && !mayClearDod;

    const p = personDoc.data();
    if (!keepDod && (p.isDeceased !== isDeceased || p.deathYear !== deathYear)) {
      console.log(`${tag}person ${personId}: isDeceased ${p.isDeceased} -> ${isDeceased}, deathYear '${p.deathYear ?? ''}' -> '${deathYear}'`);
      if (!DRY_RUN) await personDoc.ref.update({ isDeceased, deathYear });
      result.personWrites++;
    }

    for (const mDoc of membershipsByPerson.get(personId) ?? []) {
      const m = mDoc.data();
      const update = {};
      if (m.memberBirthYear !== birthYear && !(keepDob && m.memberBirthYear)) update.memberBirthYear = birthYear;
      if (!keepDod && m.memberIsDeceased !== isDeceased) update.memberIsDeceased = isDeceased;
      if (!keepDod && m.memberDeathYear !== deathYear) update.memberDeathYear = deathYear;
      if (keepDob && m.memberBirthYear) result.protected++;
      if (!Object.keys(update).length) continue;
      console.log(`${tag}membership ${mDoc.id} (person ${personId}): ${JSON.stringify(update)}`);
      if (!DRY_RUN) await mDoc.ref.update(update);
      result.membershipWrites++;
    }

    for (const fDoc of feesByPerson.get(personId) ?? []) {
      const current = fDoc.data().memberBirthYear;
      if (current === birthYear) continue;
      if (keepDob && current) {
        console.log(`  ~ keep member fee ${fDoc.id} (person ${personId}): '${current}' — no dob in the vault, replica is the only copy`);
        result.protected++;
        continue;
      }
      console.log(`${tag}member fee ${fDoc.id} (person ${personId}): '${current ?? ''}' -> '${birthYear}'`);
      if (!DRY_RUN) await fDoc.ref.update({ memberBirthYear: birthYear });
      result.feeWrites++;
    }
  }

  console.log('---');
  console.log(`persons scanned:      ${result.persons}`);
  console.log(`persons updated:      ${result.personWrites}`);
  console.log(`memberships updated:  ${result.membershipWrites}`);
  console.log(`member fees updated:  ${result.feeWrites}`);
  console.log(`replicas protected:   ${result.protected}  (value kept — the vault never held it)`);
  if (DRY_RUN) console.log('\n(dry run — no writes performed)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
