import * as admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { GroupCollection, MembershipCollection, OrgCollection, OwnershipCollection, PersonalRelCollection, PersonCollection, PersonModel, ReservationCollection, ResourceCollection, WorkrelCollection } from "@bk2/shared-models";
import {
  getAllMembershipsOfMember, getAllMembershipsOfOrg,
  getAllOwnershipsOfOwner, getAllOwnershipsOfResource,
  getAllPersonalRelsOfObject, getAllPersonalRelsOfSubject,
  getAllReservationsOfReserver, getAllReservationsOfResource,
  getAllWorkrelsOfObject, getAllWorkrelsOfSubject,
  updateFavoriteAddressInfo
} from "@bk2/shared-util-functions";

const firestore = admin.firestore(); 

/**
 * BE AWARE OF RECURSIVE TRIGGERS !
 * 
 * person/address -> person (fav*)
 * org/address -> org (fav*)
 * resource -> ownership, reservation
 * person -> ownership, membership, personalRel, workingRel, reservation
 * org -> ownership, membership, workingRel
 * group -> membership
 * 
 * As a general rule, there must be no trigger on any relationships.
 * Also, person and org should not trigger a change down into addresses (only upwards from address to person or org)
 */

/**
 * If a person is changed, we update the favorite address info of the person.
 * This is necessary to keep the favorite address info in sync with the address data.
 * THIS UPDATES PERSON (AND TRIGGERS onPersonChange) - be cautious about circular updates!   
 */
export const onPersonAddressChange = onDocumentWritten(
  {
    document: `${PersonCollection}/{personId}/addresses/{addressId}`, 
    region: 'europe-west6'
  }, 
  async (event) => {
    await updateFavoriteAddressInfo(firestore, event.params.personId, PersonCollection);
  }
);

/**
 * If an address of an organization is changed, we update the favorite address info of the organization.
 * This is necessary to keep the favorite address info in sync with the address data.
 * THIS UPDATES ORG - be cautious about circular updates!
 */
export const onOrgAddressChange = onDocumentWritten(
  {
    document: `${OrgCollection}/{orgId}/addresses/{addressId}`,
    region: 'europe-west6'
  }, 
  async (event) => {
    await updateFavoriteAddressInfo(firestore, event.params.orgId, OrgCollection);
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

        // synchronize the ownerships
        const ownerships = await getAllOwnershipsOfResource(firestore, resourceId)
        for (const ownership of ownerships) {
          const ownershipRef = admin.firestore().doc(`${OwnershipCollection}/${ownership.bkey}`);
          await ownershipRef.update({
            resourceName: resource.name,
            resourceType: resource.type,
            resourceSubType: resource.subType,
          });
          logger.info(`Successfully updated ownership ${ownership.bkey} for resource ${resourceId}`);
        }

        // synchronize the reservations
        const reservations = await getAllReservationsOfResource(firestore, resourceId);
        for (const reservation of reservations) {
          const resRef = admin.firestore().doc(`${ReservationCollection}/${reservation.bkey}`);
          await resRef.update({
            resourceName: resource.name,
            resourceType: resource.type,
            resourceSubType: resource.subType,
          });
          logger.info(`Successfully updated reservation ${reservation.bkey} for resource ${resourceId} (resource)`);
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

    try {
      const person = event.data?.after.data();
      if (person) {

        // synchronize the ownerships
        const ownerships = await getAllOwnershipsOfOwner(firestore, personId);
        for (const ownership of ownerships) {
          const ownershipRef = admin.firestore().doc(`${OwnershipCollection}/${ownership.bkey}`);
          await ownershipRef.update({
            ownerName1: person.firstName,
            ownerName2: person.lastName,
            ownerType: person.gender,
          });
          logger.info(`Successfully updated ownership ${ownership.bkey} for person ${personId} (owner)`);
        }

        // synchronize the memberships
        const memberships = await getAllMembershipsOfMember(firestore, personId);
        for (const membership of memberships) {
          const membershipRef = admin.firestore().doc(`${MembershipCollection}/${membership.bkey}`);
          await membershipRef.update({
            memberName1: person.firstName,
            memberName2: person.lastName,
            memberType: person.gender,
            memberDateOfBirth: person.dateOfBirth,
            memberDateOfDeath: person.dateOfDeath,
            memberZipCode: person.favZipCode,
            memberBexioId: person.bexioId,
          });
          logger.info(`Successfully updated membership ${membership.bkey} for person ${personId} (member)`);
        }

        // synchronize the personalRels (by subject)
        const personalRels = await getAllPersonalRelsOfSubject(firestore, personId);
        for (const personalRel of personalRels) {
          const personalRelRef = admin.firestore().doc(`${PersonalRelCollection}/${personalRel.bkey}`);
          await personalRelRef.update({
            subjectFirstName: person.firstName,
            subjectLastName: person.lastName,
            subjectGender: person.gender,
          });
          logger.info(`Successfully updated personalRel ${personalRel.bkey} for person ${personId} (subject)`);
        }

        // synchronize the personalRels (by object)
        const personalRelsByObject = await getAllPersonalRelsOfObject(firestore, personId);
        for (const personalRel of personalRelsByObject) {
          const personalRelRef = admin.firestore().doc(`${PersonalRelCollection}/${personalRel.bkey}`);
          await personalRelRef.update({
            objectFirstName: person.firstName,
            objectLastName: person.lastName,
            objectGender: person.gender,
          });
          logger.info(`Successfully updated personalRel ${personalRel.bkey} for person ${personId} (object)`);
        }

        // synchronize the workRels (by subject)
        const workRels = await getAllWorkrelsOfSubject(firestore, personId);
        for (const workRel of workRels) {
          const workRelRef = admin.firestore().doc(`${WorkingRelCollection}/${workRel.bkey}`);
          await workRelRef.update({
            subjectName1: person.firstName,
            subjectName2: person.lastName,
            subjectType: person.gender,
          });
          logger.info(`Successfully updated personalRel ${workRel.bkey} for person ${personId} (subject)`);
        }

        // synchronize the reservations (by reserver)
        const reservations = await getAllReservationsOfReserver(firestore, personId);
        for (const reservation of reservations) {
          const resRef = admin.firestore().doc(`${ReservationCollection}/${reservation.bkey}`);
          await resRef.update({
            reserverName: person.firstName,
            reserverName2: person.lastName,
            reserverType: person.gender,
          });
          logger.info(`Successfully updated reservation ${reservation.bkey} for person ${personId} (reserver)`);
        }

      } else {
        logger.warn(`Person ${personId} does not exist or has been deleted.`);
      }
    } catch (error) {
      logger.error(`Error updating person ${personId}:`, { error });
    }
  }
);

/**
 * If an organization is changed, we update all its relationships.
 * THIS UPDATES OWNERSHIP, MEMBERSHIP, WORKINGRELS - be cautious about circular updates!
 */
export const onOrgChange = onDocumentWritten(
  {
    document: `${OrgCollection}/{orgId}`,
    region: 'europe-west6'
  },
  async (event) => {
    const orgId = event.params.orgId;
    logger.info(`org ${orgId} has changed`);

    try {
      const org = event.data?.after.data();
      if (org) {

        // synchronize the ownerships
        const ownerships = await getAllOwnershipsOfOwner(firestore, orgId);
        for (const ownership of ownerships) {
          const ownershipRef = admin.firestore().doc(`${OwnershipCollection}/${ownership.bkey}`);
          await ownershipRef.update({
            ownerName1: '',
            ownerName2: org.name,
            ownerType: org.type,
          });
          logger.info(`Successfully updated ownership ${ownership.bkey} for org ${orgId} (owner)`);
        }

        // synchronize the memberships of the member org
        const memberships = await getAllMembershipsOfMember(firestore, orgId);
        for (const membership of memberships) {
          const membershipRef = admin.firestore().doc(`${MembershipCollection}/${membership.bkey}`);
          await membershipRef.update({
            memberName1: '',
            memberName2: org.name,
            memberType: org.type,
            memberDateOfBirth: org.dateOfFoundation,
            memberDateOfDeath: org.dateOfLiquidation,
            memberZipCode: org.favZipCode,
            memberBexioId: org.bexioId,
          });
          logger.info(`Successfully updated membership ${membership.bkey} for org ${orgId} (member)`);
        }

        // synchronize the membership org
        const memberOrgs = await getAllMembershipsOfOrg(firestore, orgId);
        for (const membership of memberOrgs) {
          const membershipRef = admin.firestore().doc(`${MembershipCollection}/${membership.bkey}`);
          await membershipRef.update({
            orgName: org.name,
          });
          logger.info(`Successfully updated membership ${membership.bkey} for org ${orgId} (org)`);
        }

        // synchronize the workingRels (by object)
        const workRels = await getAllWorkrelsOfObject(firestore, orgId);
        for (const workRel of workRels) {
          const workRelRef = admin.firestore().doc(`${WorkrelCollection}/${workRel.bkey}`);
          await workRelRef.update({
            objectName: org.name,
            objectType: org.type,
          });
          logger.info(`Successfully updated workingRel ${workRel.bkey} for org ${orgId} (object)`);
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
        const memberships = await getAllMembershipsOfMember(firestore, groupId);
        for (const membership of memberships) {
          const membershipRef = admin.firestore().doc(`${MembershipCollection}/${membership.bkey}`);
          await membershipRef.update({
            memberName1: '',
            memberName2: group.name,
            memberDateOfBirth: '',
            memberDateOfDeath: '',
            memberZipCode: '',
            memberBexioId: '',
          });
          logger.info(`Successfully updated membership ${membership.bkey} for group ${groupId} (member)`);
        }

        // synchronize the membership group
        const memberOrgs = await getAllMembershipsOfOrg(firestore, groupId);
        for (const membership of memberOrgs) {
          const membershipRef = admin.firestore().doc(`${MembershipCollection}/${membership.bkey}`);
          await membershipRef.update({
            orgName: group.name,
          });
          logger.info(`Successfully updated membership ${membership.bkey} for group ${groupId} (org)`);
        }
      } else {
        logger.warn(`Org ${groupId} does not exist or has been deleted.`);
      }
    } catch (error) {
      logger.error(`Error updating org ${groupId}:`, { error });
    }
  }
);