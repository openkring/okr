import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressModel, MembershipCollection, PersonCollection, ScsMemberFeesCollection } from '@okr/shared-models';
import { getBirthYear, getStoreDateYear } from '@okr/shared-util-core';

import { getScalarChannelValue } from './address.util';
import { getAllMemberFeesOfMember, getAllMembershipsOfMember } from './membership.util';

/**
 * The degraded-precision replicas of the sensitive scalar vault channels (spec 1.19).
 *
 * Both functions take the person's LIVE vault addresses (getActiveAddresses) and derive
 * the replica from them — never from a single address document, because deleting an
 * address is a soft delete and a person can hold more than one doc of a scalar channel.
 * They are the ONLY writers of these fields, shared by the `onAddressChange` trigger and
 * the `resyncVaultReplicas` backfill so the two can never drift apart.
 */

/**
 * Guard for BULK backfills: may a sweep clear a replica down to ''?
 *
 * Pass `allAddresses` (INCLUDING archived) as `evidence`. Clearing is allowed only when
 * a doc of that channel exists — i.e. the vault shows the value was deleted. A person
 * with no doc of the channel at all never had it in the vault, so the replica is the
 * ONLY surviving copy (memberships/fees were seeded from the legacy memberDateOfBirth,
 * which Phase 4 stripped) and must be left alone.
 *
 * Omit `evidence` in the trigger: there, an empty vault means the last address was just
 * deleted, and clearing is exactly the point.
 */
function mayClear(channel: string, evidence?: AddressModel[]): boolean {
  return !evidence || evidence.some((a) => a.addressChannel === channel);
}

/**
 * Sync the dob replica (`memberBirthYear`, YYYY) onto the person's memberships and
 * pending member-fee entries. The vault dob address is the only dob source
 * (person.dateOfBirth was stripped in Phase 4). Neither collection has a trigger —
 * no recursion.
 * @param addresses the person's LIVE addresses (archived excluded)
 * @param evidence  bulk backfills only: ALL the person's addresses, incl. archived — see mayClear
 * @returns the number of documents actually written
 */
export async function syncBirthYearReplicas(firestore: Firestore, personId: string, addresses: AddressModel[], evidence?: AddressModel[]): Promise<number> {
  const birthYear = getBirthYear(getScalarChannelValue(addresses, 'dob'));
  // an empty derived value with no evidence of deletion must not overwrite a real one
  const keep = !birthYear && !mayClear('dob', evidence);
  let written = 0;

  const memberships = await getAllMembershipsOfMember(firestore, personId, 'person');
  for (const m of memberships) {
    const current = (m as { memberBirthYear?: string }).memberBirthYear;
    if (current === birthYear || (keep && current)) continue;
    await firestore.doc(`${MembershipCollection}/${m.okey}`).update({ memberBirthYear: birthYear });
    logger.info(`Synced memberBirthYear for membership ${m.okey} of person ${personId}`);
    written++;
  }

  // scs-memberfees carries the same replica and drives the junior cut-off of the
  // yearly invoice run — a dob correction has to reach the pending entries too.
  const fees = await getAllMemberFeesOfMember(firestore, personId);
  for (const fee of fees) {
    if (fee.memberBirthYear === birthYear || (keep && fee.memberBirthYear)) continue;
    await firestore.doc(`${ScsMemberFeesCollection}/${fee.okey}`).update({ memberBirthYear: birthYear });
    logger.info(`Synced memberBirthYear for member fee ${fee.okey} of person ${personId}`);
    written++;
  }
  return written;
}

/**
 * Sync the dod replicas: the vault dod address is the only date of death, and
 * `persons.isDeceased`/`deathYear` + `memberships.memberIsDeceased`/`memberDeathYear`
 * are its degraded-precision copies — the fact and the year, never the full date.
 *
 * ⚠️ A person with no live dod address is treated as NOT deceased. Run the
 * `migrateDateOfDeath` migration BEFORE any bulk use of this, or it will clear the
 * flag of everyone whose date of death still sits on the legacy `persons.dateOfDeath`.
 * @param addresses the person's LIVE addresses (archived excluded)
 * @param evidence  bulk backfills only: ALL the person's addresses, incl. archived — see mayClear
 * @returns the number of documents actually written
 */
export async function syncDateOfDeathReplicas(firestore: Firestore, personId: string, addresses: AddressModel[], evidence?: AddressModel[]): Promise<number> {
  const dod = getScalarChannelValue(addresses, 'dod');
  const isDeceased = dod.length > 0;
  const deathYear = getStoreDateYear(dod);
  let written = 0;

  // no dod in the vault and no evidence one was deleted: leave the replicas alone
  if (!isDeceased && !mayClear('dod', evidence)) return 0;

  const personRef = firestore.doc(`${PersonCollection}/${personId}`);
  const personSnap = await personRef.get();
  const p = personSnap.data();
  if (personSnap.exists && (p?.['isDeceased'] !== isDeceased || p?.['deathYear'] !== deathYear)) {
    // triggers onPersonChange — it no longer syncs these fields
    await personRef.update({ isDeceased, deathYear });
    logger.info(`Synced isDeceased=${isDeceased}/deathYear=${deathYear} for person ${personId}`);
    written++;
  }

  const memberships = await getAllMembershipsOfMember(firestore, personId, 'person');
  for (const m of memberships) {
    const member = m as { memberIsDeceased?: boolean; memberDeathYear?: string };
    if (member.memberIsDeceased !== isDeceased || member.memberDeathYear !== deathYear) {
      await firestore.doc(`${MembershipCollection}/${m.okey}`)
        .update({ memberIsDeceased: isDeceased, memberDeathYear: deathYear });
      logger.info(`Synced memberIsDeceased/memberDeathYear for membership ${m.okey} of person ${personId}`);
      written++;
    }
  }
  return written;
}
