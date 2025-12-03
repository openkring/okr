import { MembershipCollection, MembershipModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';

/**
 * Retrieves all memberships of a member (i.e. person, org, or group).
 * @param firestore
 * @param memberId the id of the member to retrieve its memberships for
 * @returns an array of memberships for the given member.
 */
export async function getAllMembershipsOfMember(firestore: Firestore, memberId: string): Promise<MembershipModel[]> {
  const query = [{ key: 'memberKey', operator: '==', value: memberId }];
  return await searchData<MembershipModel>(firestore, MembershipCollection, query, 'orgName', 'asc');
}

/**
 * Retrieves all members of an organization.
 * @param firestore
 * @param orgId the id of the organization to retrieve its members for
 * @returns an array of memberships for the given organization.
 */
export async function getAllMembershipsOfOrg(firestore: Firestore, orgId: string): Promise<MembershipModel[]> {
  const query = [{ key: 'orgKey', operator: '==', value: orgId }];
  return await searchData<MembershipModel>(firestore, MembershipCollection, query, 'memberName2', 'asc');
}
