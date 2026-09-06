import { AvatarInfo, GroupModel, RoleName, Roles, UserModel } from '@okr/shared-models';
import { addIndexElement, deaccent } from '@okr/shared-util-core';

/*-------------------------- key derivation --------------------------------*/
/** Maximum length of a group key derived from the group name. */
export const GROUP_KEY_MAX_LENGTH = 15;

/**
 * Derive a stable, storage-safe group key from a group name:
 * de-accented, lower-cased, stripped to `[a-z0-9]` (no blanks, no special chars),
 * truncated to `maxLength`, and prefixed with the tenant (`<tenantId>_<name>`).
 * Returns '' when the name has no usable characters (the caller must guard against
 * an empty key).
 *
 * The tenant prefix is what keeps the key globally unique: `groups` is a single
 * top-level collection keyed by okey and `createModel` writes with `setDoc`, so an
 * unprefixed "Notfall" in a second tenant would overwrite the first tenant's group
 * document. The Matrix room alias is derived from the same key (`#group_<okey>`), so
 * the prefix also stops two tenants from sharing one chat room.
 * @param name the group display name
 * @param tenantId the tenant the group is created in
 * @param maxLength maximum length of the name part (default {@link GROUP_KEY_MAX_LENGTH})
 */
export function getGroupKeyFromName(name: string | undefined, tenantId: string, maxLength = GROUP_KEY_MAX_LENGTH): string {
  const base = deaccent(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, maxLength);
  return base ? `${tenantId}_${base}` : '';
}

/**
 * Derive a group key from the name that is unique among `takenKeys`. Group keys share
 * a namespace with org keys (membership FKs point to org OR group), so `takenKeys`
 * should include every existing group AND org key. On collision a numeric suffix is
 * appended (`base`, `base2`, `base3`, …) while keeping the result within `maxLength`.
 * @param name the group display name
 * @param tenantId the tenant the group is created in (prefixes the key, see {@link getGroupKeyFromName})
 * @param takenKeys all keys already in use (groups + orgs)
 * @param maxLength maximum length of the name part (default {@link GROUP_KEY_MAX_LENGTH})
 */
export function getUniqueGroupKey(name: string | undefined, tenantId: string, takenKeys: Iterable<string>, maxLength = GROUP_KEY_MAX_LENGTH): string {
  const taken = takenKeys instanceof Set ? takenKeys : new Set(takenKeys);
  const base = getGroupKeyFromName(name, tenantId, maxLength);
  if (!base) return '';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = base + String(i);
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

/*-------------------------- creator safety net --------------------------------*/

/**
 * Guarantees that whoever creates a group can still reach it afterwards.
 *
 * The trap this closes: a privileged user opens the group form for someone else, replaces the
 * pre-filled admin with that person and saves. `ensureAllAdminsAreMember` then makes only the
 * *new* admin a member — the creator is neither admin nor member, the group vanishes from their
 * view, and the obvious reaction is to create it again. That is a duplicate-group generator.
 *
 * The creator is **appended**, never prepended: `getMainContact` returns `admins[0]`, so the
 * person the creator nominated stays the group's main contact.
 *
 * @param admins the admin list as edited in the form
 * @param creator the avatar of the user creating the group; undefined leaves the list untouched
 * @returns the admin list including the creator (unchanged when they are already in it)
 */
export function withCreatorAsAdmin(admins: AvatarInfo[] | undefined, creator: AvatarInfo | undefined): AvatarInfo[] {
  const list = admins ?? [];
  if (!creator || creator.key.length === 0) return list;
  if (list.some(a => a.key === creator.key)) return list;
  return [...list, creator];
}

/*-------------------------- duplicate & key hygiene --------------------------------*/

/** The normalised form two group names are compared by ('SCS Vierer' == 'scs-vierer'). */
export function getGroupNameKey(name: string | undefined): string {
  return deaccent(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Live groups whose names collide once normalised. */
export type GroupDuplicate = {
  /** the normalised name the group members share */
  nameKey: string;
  groups: GroupModel[];
};

/**
 * Finds live groups that are the same group by name. Ad-hoc chat documents (`kind: 'chat'`) are
 * excluded — they are named after the conversation and repeat legitimately.
 * @param groups all groups of the tenant
 */
export function findDuplicateGroups(groups: GroupModel[]): GroupDuplicate[] {
  const byName = new Map<string, GroupModel[]>();
  for (const group of groups) {
    if (group.isArchived) continue;
    if ((group.kind ?? 'group') !== 'group') continue;
    const nameKey = getGroupNameKey(group.name);
    if (nameKey.length === 0) continue;
    const bucket = byName.get(nameKey);
    if (bucket) bucket.push(group); else byName.set(nameKey, [group]);
  }
  return [...byName.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([nameKey, bucket]) => ({ nameKey, groups: [...bucket].sort((a, b) => a.okey.localeCompare(b.okey)) }));
}

/** The create-time guard: live groups already carrying this name. */
export function findConflictingGroups(name: string | undefined, groups: GroupModel[]): GroupModel[] {
  const nameKey = getGroupNameKey(name);
  if (nameKey.length === 0) return [];
  return groups.filter(g => !g.isArchived && (g.kind ?? 'group') === 'group' && getGroupNameKey(g.name) === nameKey);
}

/**
 * Group keys that provisioning creates unprefixed on purpose, and that the prefix check must not
 * report. Two families:
 * - the ROLE groups, whose key IS the role name so `hasRole` and the group line up;
 * - the ORG groups, whose key IS the tenant/org id (see the tenant-model skill: org and group
 *   share one key namespace, and `org.scs` + `group.scs` colliding is intended).
 *
 * A tenant's own id is exempt implicitly (it is passed in as `tenantId`).
 */
export const SEEDED_GROUP_KEYS = [
  'auditors', 'contentAdmin', 'memberAdmin', 'resourceAdmin', 'treasurer',
  'support', 'notfall', 'vorstand',
] as const;

export type GroupKeyIssueKind =
  /** the okey holds characters the derived ids cannot carry verbatim (blank, umlaut, emoji) */
  | 'unsafeCharacters'
  /** the okey lacks the `<tenantId>_` prefix that keeps it unique across tenants */
  | 'missingTenantPrefix'
  /** two okeys collapse to the same Matrix room alias localpart */
  | 'aliasCollision';

export type GroupKeyIssue = {
  okey: string;
  name: string;
  kind: GroupKeyIssueKind;
  /** the derived alias localpart — set for every kind, it is what a collision is measured on */
  aliasLocalpart: string;
  /** the other okeys sharing that localpart; only set for 'aliasCollision' */
  collidesWith: string[];
};

/**
 * Mirrors `groupRoomAliasLocalpart` in apps/functions/src/matrix-simple/shared.ts, which is the
 * source of truth. Kept as a copy because a lib cannot import from the functions app; if the
 * server-side normalisation ever changes, change it here too — the whole point of this check is
 * to predict what the server will derive.
 */
export function getGroupAliasLocalpart(okey: string): string {
  return `group_${okey.toLowerCase().replace(/[^a-z0-9._~-]/g, '_')}`;
}

/**
 * Reports group keys that predate `getGroupKeyFromName` (introduced 2026-07-07) or that would
 * derive an ambiguous Matrix alias.
 *
 * Renaming a key is deliberately NOT offered: the okey is referenced by `memberships.orgKey`, the
 * group's calendar document id AND its `owner`, every `calevent.calendars[]` entry, the files and
 * album folders, task `listId`s and page ids. This is a report, so a human can decide.
 *
 * @param groups all groups of the tenant
 * @param tenantId the tenant the groups belong to
 * @param seededKeys keys that are legitimately unprefixed (the role and org groups created by
 *   provisioning); they are exempt from the `missingTenantPrefix` finding
 */
export function findGroupKeyIssues(groups: GroupModel[], tenantId: string, seededKeys: Iterable<string> = []): GroupKeyIssue[] {
  const exempt = new Set<string>([...seededKeys, ...SEEDED_GROUP_KEYS, tenantId]);
  const live = groups.filter(g => !g.isArchived && (g.kind ?? 'group') === 'group');

  const byLocalpart = new Map<string, string[]>();
  for (const group of live) {
    const localpart = getGroupAliasLocalpart(group.okey);
    const bucket = byLocalpart.get(localpart);
    if (bucket) bucket.push(group.okey); else byLocalpart.set(localpart, [group.okey]);
  }

  const issues: GroupKeyIssue[] = [];
  for (const group of live) {
    const aliasLocalpart = getGroupAliasLocalpart(group.okey);
    const sharing = (byLocalpart.get(aliasLocalpart) ?? []).filter(k => k !== group.okey);

    if (sharing.length > 0) {
      issues.push({ okey: group.okey, name: group.name, kind: 'aliasCollision', aliasLocalpart, collidesWith: sharing });
    }
    if (/[^A-Za-z0-9_-]/.test(group.okey)) {
      issues.push({ okey: group.okey, name: group.name, kind: 'unsafeCharacters', aliasLocalpart, collidesWith: [] });
    } else if (!exempt.has(group.okey) && !group.okey.startsWith(`${tenantId}_`)) {
      issues.push({ okey: group.okey, name: group.name, kind: 'missingTenantPrefix', aliasLocalpart, collidesWith: [] });
    }
  }
  return issues;
}
