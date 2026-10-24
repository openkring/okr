import { RoleName, UserModel } from '@okr/shared-models';
import { chipMatches, getFullName, nameMatches } from '@okr/shared-util-core';

export type UserAccountKind = 'normal' | 'loginWithoutUser' | 'userWithoutLogin' | 'memberWithoutAccount';

export interface UserAccountRow {
  kind: UserAccountKind;
  uid?: string;
  personKey?: string;
  loginEmail?: string;
  loginId?: string;
  name: string;
  user?: UserModel;
  roles: RoleName[];
}

/** The roles a user holds (the true keys of UserModel.roles). */
function rolesOf(user: UserModel): RoleName[] {
  return Object.entries(user.roles ?? {}).filter(([, on]) => on === true).map(([role]) => role as RoleName);
}

/**
 * Merges Firebase logins, user docs and active members into account rows (spec 1.101):
 * - login + user of the own tenant -> normal (a user of another tenant is skipped)
 * - login without a user doc -> loginWithoutUser (operator only; the server returns it to nobody else)
 * - user without a login -> userWithoutLogin
 * - active member whose person has no user in this tenant -> memberWithoutAccount
 * With `sourcesComplete` false (a read failed) no problem kind is produced: a missing source would
 * otherwise turn every member/user into a fake problem.
 */
export function buildUserAccountRows(
  users: UserModel[],
  logins: { uid: string; email?: string }[],
  activeMembers: { personKey: string; name: string }[],
  tenantId: string,
  isOperator: boolean,
  sourcesComplete = true,
): UserAccountRow[] {
  // Raw Firestore reads: a legacy user doc may lack `tenants` (the model default never applies).
  const inTenant = (u: UserModel): boolean => (u.tenants ?? []).includes(tenantId);
  const userByUid = new Map(users.map(u => [u.okey, u]));
  const rows: UserAccountRow[] = [];
  const seenUids = new Set<string>();

  for (const login of logins) {
    seenUids.add(login.uid);
    const user = userByUid.get(login.uid);
    if (!user) {
      if (!isOperator) continue;
      const loginEmail = login.email ?? '';
      rows.push({ kind: 'loginWithoutUser', uid: login.uid, loginEmail, name: loginEmail, roles: [] });
      continue;
    }
    if (!inTenant(user)) continue;
    rows.push({
      kind: 'normal', uid: login.uid, personKey: user.personKey, loginEmail: user.loginEmail || login.email || '',
      loginId: user.loginId ?? '', name: getFullName(user.firstName, user.lastName), user, roles: rolesOf(user),
    });
  }

  for (const user of users) {
    if (!inTenant(user) || seenUids.has(user.okey)) continue;
    seenUids.add(user.okey);
    rows.push({
      kind: 'userWithoutLogin', uid: user.okey, personKey: user.personKey, loginEmail: user.loginEmail,
      loginId: user.loginId ?? '', name: getFullName(user.firstName, user.lastName), user, roles: rolesOf(user),
    });
  }

  // Only users of THIS tenant account for a member: the operator's user list spans every tenant, and a
  // member with a user elsewhere still has no account here.
  const accountedPersonKeys = new Set(users.filter(inTenant).map(u => u.personKey).filter(Boolean));
  for (const member of activeMembers) {
    if (accountedPersonKeys.has(member.personKey)) continue;
    rows.push({ kind: 'memberWithoutAccount', personKey: member.personKey, name: member.name, roles: [] });
  }
  return sourcesComplete ? rows : rows.filter(r => r.kind === 'normal');
}

/**
 * The list chips are filters on ALL rows (spec 1.101 phase 4, revised 2026-10-24): without a chip
 * every row shows; `problems` keeps the three problem kinds, `extendedRoles` the rows holding a role
 * besides `registered`. Both on intersect.
 */
export function filterUserAccountRows(
  rows: UserAccountRow[],
  opts: { problems?: boolean; extendedRoles?: boolean },
): UserAccountRow[] {
  return rows.filter(r =>
    (!opts.problems || r.kind !== 'normal') &&
    (!opts.extendedRoles || hasExtendedRole(r)));
}

/** A role beyond plain membership (anything but `registered`). */
export function hasExtendedRole(row: UserAccountRow): boolean {
  return row.roles.some(role => role !== 'registered');
}

/** Search term (name, email, Benutzername, user index) and tag; rows without a user doc carry no tags. */
export function searchUserAccountRows(rows: UserAccountRow[], term: string, tag: string): UserAccountRow[] {
  return rows.filter(r =>
    nameMatches((r.user?.index ?? '') + ' ' + r.name + ' ' + (r.loginEmail ?? '') + ' ' + (r.loginId ?? ''), term) &&
    chipMatches(r.user?.tags ?? '', tag));
}
