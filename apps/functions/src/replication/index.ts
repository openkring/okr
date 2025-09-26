import * as admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { GroupCollection, MembershipCollection, OrgCollection, OwnershipCollection, PersonalRelCollection, PersonCollection, ReservationCollection, ResourceCollection, WorkingRelCollection } from "@bk2/shared-models";
import {
  getAllMembershipsOfMember, getAllMembershipsOfOrg,
  getAllOwnershipsOfOwner, getAllOwnershipsOfResource,
  getAllPersonalRelsOfObject, getAllPersonalRelsOfSubject,
  getAllReservationsOfReserver, getAllReservationsOfResource,
  getAllWorkingRelsOfObject, getAllWorkingRelsOfSubject,
  updateFavoriteAddressInfo
} from "@bk2/shared-util-functions";

const firestore = admin.firestore(); 

/**
 * BE AWARE OF RECURSIVE TRIGGERS !
 * 
 * person/address -> person (fav_*)
 * org/address -> org (fav_*)
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
    await updateFavoriteAddressInfo(firestore, event.params.personId, PersonCollection, 'person');
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
    await updateFavoriteAddressInfo(firestore, event.params.orgId, OrgCollection, 'org');
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
      const _resource = event.data?.after.data();
      if (_resource) {

        // synchronize the ownerships
        const _ownerships = await getAllOwnershipsOfResource(firestore, resourceId)
        for (const _ownership of _ownerships) {
          const _ownershipRef = admin.firestore().doc(`${OwnershipCollection}/${_ownership.bkey}`);
          await _ownershipRef.update({
            resourceName: _resource.name,
            resourceType: _resource.type,
            resourceSubType: _resource.subType,
          });
          logger.info(`Successfully updated ownership ${_ownership.bkey} for resource ${resourceId}`);
        }

        // synchronize the reservations
        const _reservations = await getAllReservationsOfResource(firestore, resourceId);
        for (const _reservation of _reservations) {
          const _resRef = admin.firestore().doc(`${ReservationCollection}/${_reservation.bkey}`);
          await _resRef.update({
            resourceName: _resource.name,
            resourceType: _resource.type,
            resourceSubType: _resource.subType,
          });
          logger.info(`Successfully updated reservation ${_reservation.bkey} for resource ${resourceId} (resource)`);
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
      const _person = event.data?.after.data();
      if (_person) {

        // synchronize the ownerships
        const _ownerships = await getAllOwnershipsOfOwner(firestore, personId);
        for (const _ownership of _ownerships) {
          const _ownershipRef = admin.firestore().doc(`${OwnershipCollection}/${_ownership.bkey}`);
          await _ownershipRef.update({
            ownerName1: _person.firstName,
            ownerName2: _person.lastName,
            ownerType: _person.gender,
          });
          logger.info(`Successfully updated ownership ${_ownership.bkey} for person ${personId} (owner)`);
        }

        // synchronize the memberships
        const _memberships = await getAllMembershipsOfMember(firestore, personId);
        for (const _membership of _memberships) {
          const _membershipRef = admin.firestore().doc(`${MembershipCollection}/${_membership.bkey}`);
          await _membershipRef.update({
            memberName1: _person.firstName,
            memberName2: _person.lastName,
            memberType: _person.gender,
            memberDateOfBirth: _person.dateOfBirth,
            memberDateOfDeath: _person.dateOfDeath,
            memberZipCode: _person.fav_zip,
            memberBexioId: _person.bexioId,
          });
          logger.info(`Successfully updated membership ${_membership.bkey} for person ${personId} (member)`);
        }

        // synchronize the personalRels (by subject)
        const _personalRels = await getAllPersonalRelsOfSubject(firestore, personId);
        for (const _personalRel of _personalRels) {
          const _personalRelRef = admin.firestore().doc(`${PersonalRelCollection}/${_personalRel.bkey}`);
          await _personalRelRef.update({
            subjectFirstName: _person.firstName,
            subjectLastName: _person.lastName,
            subjectGender: _person.gender,
          });
          logger.info(`Successfully updated personalRel ${_personalRel.bkey} for person ${personId} (subject)`);
        }

        // synchronize the personalRels (by object)
        const _personalRelsByObject = await getAllPersonalRelsOfObject(firestore, personId);
        for (const _personalRel of _personalRelsByObject) {
          const _personalRelRef = admin.firestore().doc(`${PersonalRelCollection}/${_personalRel.bkey}`);
          await _personalRelRef.update({
            objectFirstName: _person.firstName,
            objectLastName: _person.lastName,
            objectGender: _person.gender,
          });
          logger.info(`Successfully updated personalRel ${_personalRel.bkey} for person ${personId} (object)`);
        }

        // synchronize the workingRels (by subject)
        const _workingRels = await getAllWorkingRelsOfSubject(firestore, personId);
        for (const _workingRel of _workingRels) {
          const _workingRelRef = admin.firestore().doc(`${WorkingRelCollection}/${_workingRel.bkey}`);
          await _workingRelRef.update({
            subjectName1: _person.firstName,
            subjectName2: _person.lastName,
            subjectType: _person.gender,
          });
          logger.info(`Successfully updated personalRel ${_workingRel.bkey} for person ${personId} (subject)`);
        }

        // synchronize the reservations (by reserver)
        const _reservations = await getAllReservationsOfReserver(firestore, personId);
        for (const _reservation of _reservations) {
          const _resRef = admin.firestore().doc(`${ReservationCollection}/${_reservation.bkey}`);
          await _resRef.update({
            reserverName: _person.firstName,
            reserverName2: _person.lastName,
            reserverType: _person.gender,
          });
          logger.info(`Successfully updated reservation ${_reservation.bkey} for person ${personId} (reserver)`);
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
    const _orgId = event.params.orgId;
    logger.info(`org ${_orgId} has changed`);

    try {
      const _org = event.data?.after.data();
      if (_org) {

        // synchronize the ownerships
        const _ownerships = await getAllOwnershipsOfOwner(firestore, _orgId);
        for (const _ownership of _ownerships) {
          const _ownershipRef = admin.firestore().doc(`${OwnershipCollection}/${_ownership.bkey}`);
          await _ownershipRef.update({
            ownerName1: '',
            ownerName2: _org.name,
            ownerType: _org.type,
          });
          logger.info(`Successfully updated ownership ${_ownership.bkey} for org ${_orgId} (owner)`);
        }

        // synchronize the memberships of the member org
        const _memberships = await getAllMembershipsOfMember(firestore, _orgId);
        for (const _membership of _memberships) {
          const _membershipRef = admin.firestore().doc(`${MembershipCollection}/${_membership.bkey}`);
          await _membershipRef.update({
            memberName1: '',
            memberName2: _org.name,
            memberType: _org.type,
            memberDateOfBirth: _org.dateOfFoundation,
            memberDateOfDeath: _org.dateOfLiquidation,
            memberZipCode: _org.fav_zip,
            memberBexioId: _org.bexioId,
          });
          logger.info(`Successfully updated membership ${_membership.bkey} for org ${_orgId} (member)`);
        }

        // synchronize the membership org
        const _memberOrgs = await getAllMembershipsOfOrg(firestore, _orgId);
        for (const _membership of _memberOrgs) {
          const _membershipRef = admin.firestore().doc(`${MembershipCollection}/${_membership.bkey}`);
          await _membershipRef.update({
            orgName: _org.name,
          });
          logger.info(`Successfully updated membership ${_membership.bkey} for org ${_orgId} (org)`);
        }

        // synchronize the workingRels (by object)
        const _workingRels = await getAllWorkingRelsOfObject(firestore, _orgId);
        for (const _workingRel of _workingRels) {
          const _workingRelRef = admin.firestore().doc(`${WorkingRelCollection}/${_workingRel.bkey}`);
          await _workingRelRef.update({
            objectName: _org.name,
            objectType: _org.type,
          });
          logger.info(`Successfully updated workingRel ${_workingRel.bkey} for org ${_orgId} (object)`);
        }
      } else {
        logger.warn(`Org ${_orgId} does not exist or has been deleted.`);
      }
    } catch (error) {
      logger.error(`Error updating org ${_orgId}:`, { error });
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
    const _groupId = event.params.groupId;
    logger.info(`group ${_groupId} has changed`);

    try {
      const _group = event.data?.after.data();
      if (_group) {

        // synchronize the memberships of the member group
        const _memberships = await getAllMembershipsOfMember(firestore, _groupId);
        for (const _membership of _memberships) {
          const _membershipRef = admin.firestore().doc(`${MembershipCollection}/${_membership.bkey}`);
          await _membershipRef.update({
            memberName1: '',
            memberName2: _group.name,
            memberDateOfBirth: '',
            memberDateOfDeath: '',
            memberZipCode: '',
            memberBexioId: '',
          });
          logger.info(`Successfully updated membership ${_membership.bkey} for group ${_groupId} (member)`);
        }

        // synchronize the membership group
        const _memberOrgs = await getAllMembershipsOfOrg(firestore, _groupId);
        for (const _membership of _memberOrgs) {
          const _membershipRef = admin.firestore().doc(`${MembershipCollection}/${_membership.bkey}`);
          await _membershipRef.update({
            orgName: _group.name,
          });
          logger.info(`Successfully updated membership ${_membership.bkey} for group ${_groupId} (org)`);
        }
      } else {
        logger.warn(`Org ${_groupId} does not exist or has been deleted.`);
      }
    } catch (error) {
      logger.error(`Error updating org ${_groupId}:`, { error });
    }
  }
);