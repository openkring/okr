import { MembershipCollection, MembershipModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';

/**
 * Retrieves all memberships of a member (i.e. person, org, or group).
 *
 * `memberModelType` MUST be passed to disambiguate the key collision on the member
 * side: an org (`orgs/scs`) and a group (`groups/scs`) can share the same key, so
 * `memberKey == 'scs'` alone matches both. Without the type filter an org write would
 * overwrite the group's member-memberships (memberName2/type/dates/bexioId) and vice
 * versa. See getAllMembershipsOfOrg for the object-side counterpart.
 * @param firestore
 * @param memberId the id of the member to retrieve its memberships for
 * @param memberModelType filter to memberships whose member is a 'person', 'org' or 'group'
 * @returns an array of memberships for the given member.
 */
export async function getAllMembershipsOfMember(firestore: Firestore, memberId: string, memberModelType: 'person' | 'org' | 'group'): Promise<MembershipModel[]> {
  const query = [
    { key: 'memberKey', operator: '==', value: memberId },
    { key: 'memberModelType', operator: '==', value: memberModelType },
  ];
  return await searchData<MembershipModel>(firestore, MembershipCollection, query, 'orgName', 'asc');
}

/**
 * Retrieves all members of an organization or group.
 *
 * `orgModelType` MUST be passed to disambiguate the org/group key collision: an
 * org (e.g. `orgs/scs`) and a group (e.g. `groups/scs`, the "whole club" group)
 * can share the same key. Without the type filter a group write would clobber the
 * org's memberships' `orgName` (and vice versa) because both match `orgKey == 'scs'`.
 * @param firestore
 * @param orgId the id of the organization/group to retrieve its members for
 * @param orgModelType filter to memberships whose object is an 'org' or a 'group'
 * @returns an array of memberships for the given organization/group.
 */
export async function getAllMembershipsOfOrg(firestore: Firestore, orgId: string, orgModelType: 'org' | 'group'): Promise<MembershipModel[]> {
  const query = [
    { key: 'orgKey', operator: '==', value: orgId },
    { key: 'orgModelType', operator: '==', value: orgModelType },
  ];
  return await searchData<MembershipModel>(firestore, MembershipCollection, query, 'memberName2', 'asc');
}
