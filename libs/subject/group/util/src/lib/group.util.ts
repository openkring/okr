import { AvatarInfo, GroupModel, RoleName, Roles, UserModel } from '@okr/shared-models';
import { addIndexElement, deaccent } from '@okr/shared-util-core';

/*-------------------------- key derivation --------------------------------*/
/** Maximum length of a group key derived from the group name. */
export const GROUP_KEY_MAX_LENGTH = 15;

/**
 * Derive a stable, storage-safe group key from a group name:
 * de-accented, lower-cased, stripped to `[a-z0-9]` (no blanks, no special chars),
 * truncated to `maxLength`. Returns '' when the name has no usable characters
 * (the caller must guard against an empty key).
 * @param name the group display name
 * @param maxLength maximum key length (default {@link GROUP_KEY_MAX_LENGTH})
 */
export function getGroupKeyFromName(name: string | undefined, maxLength = GROUP_KEY_MAX_LENGTH): string {
  return deaccent(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, maxLength);
}

/**
 * Derive a group key from the name that is unique among `takenKeys`. Group keys share
 * a namespace with org keys (membership FKs point to org OR group), so `takenKeys`
 * should include every existing group AND org key. On collision a numeric suffix is
 * appended (`base`, `base2`, `base3`, …) while keeping the result within `maxLength`.
 * @param name the group display name
 * @param takenKeys all keys already in use (groups + orgs)
 * @param maxLength maximum key length (default {@link GROUP_KEY_MAX_LENGTH})
 */
export function getUniqueGroupKey(name: string | undefined, takenKeys: Iterable<string>, maxLength = GROUP_KEY_MAX_LENGTH): string {
  const taken = takenKeys instanceof Set ? takenKeys : new Set(takenKeys);
  const base = getGroupKeyFromName(name, maxLength);
  if (!base) return '';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, maxLength - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

/*-------------------------- admins --------------------------------*/
export function getMainContact(group?: GroupModel): AvatarInfo | undefined {
  return group?.admins?.[0];
}

export function isAdminMember(group?: GroupModel, personKey?: string): boolean {
  if (!group || !personKey || personKey.length === 0) return false;
  return group.admins?.some(a => a.key === personKey) ?? false;
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given group based on its values.
 * @param group the group to generate the index for 
 * @returns the index string
 */
export function getGroupIndex(group: GroupModel): string {
  let index = '';
  index = addIndexElement(index, 'n', group.name);
  index = addIndexElement(index, 'k', group.okey);
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getGroupIndexInfo(): string {
  return 'n:name k:okey';
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
 * Returns the okeys of all groups whose `visibility` gives the user access,
 * excluding groups where the user is already a member (those are handled separately).
 *
 * @param allGroups   All groups loaded from Firestore for this tenant.
 * @param memberKeys  Set of group okeys the user is already a member of.
 * @param user        The current user.
 */
export function getVisibleGroupKeys(
  allGroups: GroupModel[],
  memberKeys: Set<string>,
  user: UserModel,
): string[] {
  return allGroups
    .filter(g => !memberKeys.has(g.okey) && userMatchesGroupVisibility(g, user))
    .map(g => g.okey);
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
