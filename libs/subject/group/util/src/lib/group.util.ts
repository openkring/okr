import { GroupModel, RoleName, Roles, UserModel } from '@bk2/shared-models';
import { addIndexElement } from '@bk2/shared-util-core';

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given group based on its values.
 * @param group the group to generate the index for 
 * @returns the index string
 */
export function getGroupIndex(group: GroupModel): string {
  let index = '';
  index = addIndexElement(index, 'n', group.name);
  index = addIndexElement(index, 'k', group.bkey);
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getGroupIndexInfo(): string {
  return 'n:name k:bkey';
}

/*-------------------------- visibility --------------------------------*/

/**
 * Parses a group's comma-separated `visibility` string into an array of RoleName values.
 * Returns an empty array if `visibility` is empty or undefined.
 */
export function getVisibilityRoles(group: GroupModel): RoleName[] {
  if (!group.visibility) return [];
  return group.visibility.split(',').map(r => r.trim()).filter(r => r.length > 0) as RoleName[];
}

/**
 * Returns true if the given user has at least one role that matches
 * any role listed in the group's `visibility` field.
 * Always returns false for groups with an empty `visibility`.
 */
export function userMatchesGroupVisibility(group: GroupModel, user: UserModel): boolean {
  const roles = getVisibilityRoles(group);
  if (roles.length === 0) return false;
  return roles.some(role => user.roles[role as keyof Roles] === true);
}

/**
 * Returns the bkeys of all groups whose `visibility` gives the user access,
 * excluding groups where the user is already a member (those are handled separately).
 *
 * @param allGroups   All groups loaded from Firestore for this tenant.
 * @param memberKeys  Set of group bkeys the user is already a member of.
 * @param user        The current user.
 */
export function getVisibleGroupKeys(
  allGroups: GroupModel[],
  memberKeys: Set<string>,
  user: UserModel,
): string[] {
  return allGroups
    .filter(g => !memberKeys.has(g.bkey) && userMatchesGroupVisibility(g, user))
    .map(g => g.bkey);
}

/**
 * Returns true if the given user can access this group's calendar and chat,
 * either because they are a member or because their roles match `visibility`.
 */
export function canAccessGroup(group: GroupModel, isMember: boolean, user: UserModel): boolean {
  return isMember || userMatchesGroupVisibility(group, user);
}

/**
 * Returns true if the given user should receive notifications for this group's chat.
 * - 'memberOnly': only members are notified.
 * - 'membersAndMatchingVisibility': members + users matching `visibility` roles are notified.
 */
export function shouldNotifyUser(group: GroupModel, isMember: boolean, user: UserModel): boolean {
  if (isMember) return true;
  if (group.notifyType === 'membersAndMatchingVisibility') {
    return userMatchesGroupVisibility(group, user);
  }
  return false;
}
