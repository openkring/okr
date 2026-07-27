import * as admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { AddressCollection, AddressModel, GroupCollection, MembershipCollection, OrgCollection, OwnershipCollection, PersonalRelCollection, PersonCollection, ReservationCollection, ResourceCollection, WorkrelCollection } from "@okr/shared-models";
import {
  getAllMembershipsOfMember, getAllMembershipsOfOrg,
  getAllOwnershipsOfOwner, getAllOwnershipsOfResource,
  getAllPersonalRelsOfObject, getAllPersonalRelsOfSubject,
  getAllReservationsOfReserver, getAllReservationsOfResource,
  getAllWorkrelsOfObject, getAllWorkrelsOfSubject,
  hasChanged,
  updateFavoriteZipCode,
  writeAddressDirectory
} from "@okr/shared-util-functions";
import { getBirthYear, getStoreDateYear } from "@okr/shared-util-core";

const firestore = admin.firestore();

/**
 * Synchronizes a set of related documents with new (denormalized) data.
 * Each relation type is handled independently: a failure (e.g. a missing index)
 * is logged but does NOT prevent the other relation types from being synced.
 * @param label a human-readable label for logging (e.g. 'membership')
 * @param sourceId the id of the changed source document (for logging)
 * @param collection the Firestore collection of the related documents
 * @param relations the related documents to (potentially) update
 * @param newData the denormalized data to write if it has changed
 */
async function syncRelations(
  label: string,
  sourceId: string,
  collection: string,
  relations: { okey: string }[],
  newData: Record<string, unknown>
): Promise<void> {
  try {
    for (const relation of relations) {
      if (hasChanged(relation, newData)) {
        await admin.firestore().doc(`${collection}/${relation.okey}`).update(newData);
        logger.info(`Successfully updated ${label} ${relation.okey} for ${sourceId}`);
      }
    }
  } catch (error) {
    logger.error(`Error syncing ${label} for ${sourceId}:`, { error });
  }
}

/**
 * Fetches related documents, isolating failures so that one failing query
 * (e.g. a missing composite index) does not abort the whole replication.
 */
async function fetchRelations<T>(label: string, sourceId: string, fetch: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fetch();
  } catch (error) {
    logger.error(`Error fetching ${label} for ${sourceId}:`, { error });
    return [];
  }
}

/**
 * BE AWARE OF RECURSIVE TRIGGERS !
 * 
 * address -> person/org (favZipCode)
 * resource -> ownership, reservation
 * person -> ownership, membership, personalRel, workingRel, reservation
 * org -> ownership, membership, workingRel, reservation
 * group -> membership
 * 
 * As a general rule, there must be no trigger on any relationships.
 * Also, person and org should not trigger a change to addresses (only from address to person or org)
 */

/**
 * If an address is changed, we update the favorite zip code of the parent (which is a person or organization)
 * and rebuild the address-directory projection. favEmail/favPhone are no longer replicated
 * (spec 1.19 Phase 4 strip) — contact data is served by the projection.
 * THIS UPDATES PERSON or ORG (AND TRIGGERS onPersonChange/onOrgChange) - be cautious about circular updates!
 */
export const onAddressChange = onDocumentWritten(
  {
    document: `${AddressCollection}/{addressId}`, 
    region: 'europe-west6'
  }, 
  async (event) => {
    const addressId = event.params.addressId;
    logger.info(`address ${addressId} has changed`);
    try {
      // Use after data for writes/updates; fall back to before data for deletes
      // so the parent's fav* fields are refreshed even when an address is removed.
      const address = event.data?.after.data() ?? event.data?.before.data();
      if (address) {
        await updateFavoriteZipCode(firestore, address as AddressModel, addressId);
        // spec 1.19 Phase 4: keep the address-directory projection in sync.
        // Writes only address-directory (no trigger on it) — no recursion.
        await writeAddressDirectory(firestore, (address as AddressModel).parentKey);

        // spec 1.19 Phase 4: the vault dob address is the only dob source
        // (person.dateOfBirth was stripped) — sync the degraded-precision
        // memberBirthYear replica on the person's memberships from here.
        // Memberships have no triggers — no recursion.
        if (address.addressChannel === 'dob' && (address.parentKey as string).startsWith('person.')) {
          const personId = (address.parentKey as string).substring('person.'.length);
          const birthYear = getBirthYear(event.data?.after.data()?.dob ?? '');
          const memberships = await getAllMembershipsOfMember(firestore, personId, 'person');
          for (const m of memberships) {
            if ((m as { memberBirthYear?: string }).memberBirthYear !== birthYear) {
              await admin.firestore().doc(`${MembershipCollection}/${m.okey}`).update({ memberBirthYear: birthYear });
              logger.info(`Synced memberBirthYear for membership ${m.okey} of person ${personId}`);
            }
          }
        }

        // Same for the vault dod address (spec 1.19): it is the only date of death,
        // and person.isDeceased / membership.memberIsDeceased are its degraded-precision
        // replicas — the fact, never the date. This trigger is their only writer.
        if (address.addressChannel === 'dod' && (address.parentKey as string).startsWith('person.')) {
          const personId = (address.parentKey as string).substring('person.'.length);
          const dod = String(event.data?.after.data()?.dod ?? '');
          const isDeceased = dod.length > 0;
          const deathYear = getStoreDateYear(dod);
          const personRef = admin.firestore().doc(`${PersonCollection}/${personId}`);
          const personSnap = await personRef.get();
          const p = personSnap.data();
          if (personSnap.exists && (p?.['isDeceased'] !== isDeceased || p?.['deathYear'] !== deathYear)) {
            // triggers onPersonChange — it no longer syncs these fields
            await personRef.update({ isDeceased, deathYear });
            logger.info(`Synced isDeceased=${isDeceased}/deathYear=${deathYear} for person ${personId}`);
          }
          const memberships = await getAllMembershipsOfMember(firestore, personId, 'person');
          for (const m of memberships) {
            const member = m as { memberIsDeceased?: boolean; memberDeathYear?: string };
            if (member.memberIsDeceased !== isDeceased || member.memberDeathYear !== deathYear) {
              await admin.firestore().doc(`${MembershipCollection}/${m.okey}`)
                .update({ memberIsDeceased: isDeceased, memberDeathYear: deathYear });
              logger.info(`Synced memberIsDeceased/memberDeathYear for membership ${m.okey} of person ${personId}`);
            }
          }
        }
      }
    }
    catch (error) {
      logger.error(`Error updating address ${addressId}:`, { error });
    }
  }
);

/**
 * If a resource is changed, we update all its relationships.
 * THIS UPDATES OWNERSHIP, RESERVATION - be cautious about circular updates!
 */ 
export const onResourceChange = onDocumentWritten(
  {
    document: `${ResourceCollection}/{resourceId}`,
    region: 'europe-west6'
  }, 
  async (event) => {
    const resourceId = event.params.resourceId;
    logger.info(`resource ${resourceId} has changed`);

    try {
      const resource = event.data?.after.data();
      if (resource) {
        // ownerships store the resource on flat resourceName/resourceType/resourceSubType fields
        const newOwnershipData = {
          resourceName: resource.name,
          resourceType: resource.type,
          resourceSubType: resource.subType,
        };
        // synchronize the ownerships (resource objects only; an account may share this key)
        const ownerships = await getAllOwnershipsOfResource(firestore, resourceId, 'resource')
        for (const ownership of ownerships) {
          if (hasChanged(ownership, newOwnershipData)) {
            const ownershipRef = admin.firestore().doc(`${OwnershipCollection}/${ownership.okey}`);
            await ownershipRef.update(newOwnershipData);
            logger.info(`Successfully updated ownership ${ownership.okey} for resource ${resourceId}`);
          }
        }

        // reservations store the resource as a nested `resource` AvatarInfo map (dot-notation update)
        const newReservationData = {
          'resource.name2': resource.name,
          'resource.type': resource.type,
          'resource.subType': resource.subType,
        };
        // synchronize the reservations (resource objects only; an account may share this key)
        const reservations = await getAllReservationsOfResource(firestore, resourceId, 'resource');
        for (const reservation of reservations) {
          if (hasChanged(reservation, newReservationData)) {
            const resRef = admin.firestore().doc(`${ReservationCollection}/${reservation.okey}`);
            await resRef.update(newReservationData);
            logger.info(`Successfully updated reservation ${reservation.okey} for resource ${resourceId} (resource)`);
          }
        }
      } else {
        logger.warn(`Resource ${resourceId} does not exist or has been deleted.`);
      }
    } catch (error) {
      logger.error(`Error updating resource ${resourceId}:`, { error });
    }
  }
);

/**
 * If a person is changed, we update all of its relationships.
 * THIS UPDATES OWNERSHIP, MEMBERSHIP, PERSONALRELS, WORKINGRELS, RESERVATION - be cautious about circular updates!
 */
export const onPersonChange = onDocumentWritten(
  {
    document: `${PersonCollection}/{personId}`,
    region: 'europe-west6'
  }, 
  async (event) => {
    const personId = event.params.personId;
    logger.info(`person ${personId} has changed`);

    const before = event.data?.before.data();
    const person = event.data?.after.data();

    // spec 1.19 Phase 4: the address-directory projection depends on the person's
    // usage* preferences and tenants — rebuild it when those change (or the person
    // is created/deleted). Diff first: person writes are frequent, projections are not.
    const privacyInputs = ['usageEmail', 'usagePhone', 'usagePostalAddress', 'usageDateOfBirth', 'tenants'];
    const privacyChanged = !before || !person
      || privacyInputs.some((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(person[f] ?? null));
    if (privacyChanged) {
      try {
        await writeAddressDirectory(firestore, `person.${personId}`);
      } catch (error) {
        logger.error(`Error rebuilding address directory for person ${personId}:`, { error });
      }
    }

    if (!person) {
      logger.warn(`Person ${personId} does not exist or has been deleted.`);
      return;
    }
    const source = `person ${personId}`;

    // Each relation type is synced independently. A failure in one (e.g. a missing
    // index) is logged but must NOT prevent the others from being updated.

    // synchronize the ownerships
    await syncRelations('ownership', source, OwnershipCollection,
      await fetchRelations('ownerships', source, () => getAllOwnershipsOfOwner(firestore, personId, 'person')),
      {
        ownerName1: person.firstName,
        ownerName2: person.lastName,
        ownerType: person.gender
      });

    // synchronize the memberships
    await syncRelations('membership', source, MembershipCollection,
      await fetchRelations('memberships', source, () => getAllMembershipsOfMember(firestore, personId, 'person')),
      {
        memberName1: person.firstName,
        memberName2: person.lastName,
        memberType: person.gender,
        // memberBirthYear and memberIsDeceased are NOT synced here: person.dateOfBirth
        // and person.dateOfDeath were stripped (spec 1.19 Phase 4) — the vault dob/dod
        // addresses sync both replicas via onAddressChange.
        memberZipCode: person.favZipCode,
        memberBexioId: person.bexioId,
      });

    // synchronize the personalRels (by subject)
    await syncRelations('personalRel (subject)', source, PersonalRelCollection,
      await fetchRelations('personalRels (subject)', source, () => getAllPersonalRelsOfSubject(firestore, personId)),
      {
        subjectFirstName: person.firstName,
        subjectLastName: person.lastName,
        subjectGender: person.gender
      });

    // synchronize the personalRels (by object)
    await syncRelations('personalRel (object)', source, PersonalRelCollection,
      await fetchRelations('personalRels (object)', source, () => getAllPersonalRelsOfObject(firestore, personId)),
      {
        objectFirstName: person.firstName,
        objectLastName: person.lastName,
        objectGender: person.gender
      });

    // synchronize the workRels (by subject)
    await syncRelations('workingRel (subject)', source, WorkrelCollection,
      await fetchRelations('workingRels (subject)', source, () => getAllWorkrelsOfSubject(firestore, personId, 'person')),
      {
        subjectName1: person.firstName,
        subjectName2: person.lastName,
        subjectType: person.gender
      });

    // synchronize the reservations (by reserver) — reserver is a nested AvatarInfo map (dot-notation update)
    await syncRelations('reservation (reserver)', source, ReservationCollection,
      await fetchRelations('reservations (reserver)', source, () => getAllReservationsOfReserver(firestore, personId, 'person')),
      {
        'reserver.name1': person.firstName,
        'reserver.name2': person.lastName,
        'reserver.type': person.gender,
      });
  }
);

/**
 * If an organization is changed, we update all its relationships.
 * THIS UPDATES OWNERSHIP, MEMBERSHIP, WORKINGRELS, RESERVATION - be cautious about circular updates!
 */
export const onOrgChange = onDocumentWritten(
  {
    document: `${OrgCollection}/{orgId}`,
    region: 'europe-west6'
  },
  async (event) => {
    const orgId = event.params.orgId;
    logger.info(`org ${orgId} has changed`);

    // spec 1.19 Phase 4: org projections depend on the org's tenants — rebuild on
    // tenants change and clean up on deletion (org contact channels are public,
    // so no per-org preference inputs exist).
    const beforeOrg = event.data?.before.data();
    const afterOrg = event.data?.after.data();
    const orgTenantsChanged = !beforeOrg || !afterOrg
      || JSON.stringify(beforeOrg['tenants'] ?? null) !== JSON.stringify(afterOrg['tenants'] ?? null);
    if (orgTenantsChanged) {
      try {
        await writeAddressDirectory(firestore, `org.${orgId}`);
      } catch (error) {
        logger.error(`Error rebuilding address directory for org ${orgId}:`, { error });
      }
    }

    try {
      const org = event.data?.after.data();
      if (org) {

        // synchronize the ownerships
        const newOwner = {
          ownerName1: '',
          ownerName2: org.name,
          ownerType: org.type
        };
        const ownerships = await getAllOwnershipsOfOwner(firestore, orgId, 'org');
        for (const ownership of ownerships) {
          if (hasChanged(ownership, newOwner)) {
            const ownershipRef = admin.firestore().doc(`${OwnershipCollection}/${ownership.okey}`);
            await ownershipRef.update(newOwner);
            logger.info(`Successfully updated ownership ${ownership.okey} for org ${orgId} (owner)`);
          }
        }

        // synchronize the memberships of the member org
        const newMember = {
          memberName1: '',
          memberName2: org.name,
          memberType: org.type,
          memberIsDeceased: (org.dateOfLiquidation ?? '').length > 0,
          memberDeathYear: getStoreDateYear(org.dateOfLiquidation),
          memberZipCode: org.favZipCode,
          memberBexioId: org.bexioId
        };
        const memberships = await getAllMembershipsOfMember(firestore, orgId, 'org');
        for (const membership of memberships) {
          if (hasChanged(membership, newMember)) {
            const membershipRef = admin.firestore().doc(`${MembershipCollection}/${membership.okey}`);
            await membershipRef.update(newMember);
            logger.info(`Successfully updated membership ${membership.okey} for org ${orgId} (member)`);
          }
        }

        // synchronize the membership org (org objects only; a group may share this key)
        const memberOrgs = await getAllMembershipsOfOrg(firestore, orgId, 'org');
        for (const membership of memberOrgs) {
          if (membership.orgName !== org.name) {
            const membershipRef = admin.firestore().doc(`${MembershipCollection}/${membership.okey}`);
            await membershipRef.update({
              orgName: org.name,
            });
            logger.info(`Successfully updated membership ${membership.okey} for org ${orgId} (org)`);
          }
        }

        // synchronize the workingRels (by object)
        const workRels = await getAllWorkrelsOfObject(firestore, orgId);
        for (const workRel of workRels) {
          if (workRel.objectName !== org.name || workRel.objectType !== org.type) {
            const workRelRef = admin.firestore().doc(`${WorkrelCollection}/${workRel.okey}`);
            await workRelRef.update({
              objectName: org.name,
              objectType: org.type,
            });
            logger.info(`Successfully updated workingRel ${workRel.okey} for org ${orgId} (object)`);
          }
        }

        // synchronize the reservations where this org is the reserver
        // (reserver is a nested AvatarInfo map; for an org name1 is empty, name2 holds the name)
        const newReserver = {
          'reserver.name1': '',
          'reserver.name2': org.name,
          'reserver.type': org.type,
        };
        const orgReservations = await getAllReservationsOfReserver(firestore, orgId, 'org');
        for (const reservation of orgReservations) {
          if (hasChanged(reservation, newReserver)) {
            const resRef = admin.firestore().doc(`${ReservationCollection}/${reservation.okey}`);
            await resRef.update(newReserver);
            logger.info(`Successfully updated reservation ${reservation.okey} for org ${orgId} (reserver)`);
          }
        }
      } else {
        logger.warn(`Org ${orgId} does not exist or has been deleted.`);
      }
    } catch (error) {
      logger.error(`Error updating org ${orgId}:`, { error });
    }
  }
);

/**
 * If a group is changed, we update all its relationships.
 * THIS UPDATES MEMBERSHIP - be cautious about circular updates!
 */
export const onGroupChange = onDocumentWritten(
  {
    document: `${GroupCollection}/{groupId}`,
    region: 'europe-west6'
  },
  async (event) => {
    const groupId = event.params.groupId;
    logger.info(`group ${groupId} has changed`);

    try {
      const group = event.data?.after.data();
      if (group) {

        // synchronize the memberships of the member group
        const newMember = {
          memberName1: '',
          memberName2: group.name,
          memberIsDeceased: false,
          memberDeathYear: '',
          memberZipCode: '',
          memberBexioId: ''
        };
        const memberships = await getAllMembershipsOfMember(firestore, groupId, 'group');
        for (const membership of memberships) {
          if (hasChanged(membership, newMember)) {
            const membershipRef = admin.firestore().doc(`${MembershipCollection}/${membership.okey}`);
            await membershipRef.update(newMember);
            logger.info(`Successfully updated membership ${membership.okey} for group ${groupId} (member)`);
          }
        }

        // synchronize the membership group (group objects only; an org may share this key)
        const memberOrgs = await getAllMembershipsOfOrg(firestore, groupId, 'group');
        for (const membership of memberOrgs) {
          if (membership.orgName !== group.name) {
            const membershipRef = admin.firestore().doc(`${MembershipCollection}/${membership.okey}`);
            await membershipRef.update({
              orgName: group.name,
            });
            logger.info(`Successfully updated membership ${membership.okey} for group ${groupId} (org)`);
          }
        }
      } else {
        logger.warn(`Org ${groupId} does not exist or has been deleted.`);
      }
    } catch (error) {
      logger.error(`Error updating org ${groupId}:`, { error });
    }
  }
);