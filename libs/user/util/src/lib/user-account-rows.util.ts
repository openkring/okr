import { RoleName, UserModel } from '@okr/shared-models';
import { getFullName } from '@okr/shared-util-core';

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
 * - active member whose person has no user -> memberWithoutAccount
 */
export function buildUserAccountRows(
  users: UserModel[],
  logins: { uid: string; email?: string }[],
  activeMembers: { personKey: string; name: string }[],
  tenantId: string,
  isOperator: boolean,
): UserAccountRow[] {
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
    if (!user.tenants.includes(tenantId)) continue;
    rows.push({
      kind: 'normal', uid: login.uid, personKey: user.personKey, loginEmail: user.loginEmail || login.email || '',
      loginId: user.loginId ?? '', name: getFullName(user.firstName, user.lastName), user, roles: rolesOf(user),
    });
  }

  for (const user of users) {
    if (!user.tenants.includes(tenantId) || seenUids.has(user.okey)) continue;
    seenUids.add(user.okey);
    rows.push({
      kind: 'userWithoutLogin', uid: user.okey, personKey: user.personKey, loginEmail: user.loginEmail,
      loginId: user.loginId ?? '', name: getFullName(user.firstName, user.lastName), user, roles: rolesOf(user),
    });
  }

  const accountedPersonKeys = new Set(users.map(u => u.personKey).filter(Boolean));
  for (const member of activeMembers) {
    if (accountedPersonKeys.has(member.personKey)) continue;
    rows.push({ kind: 'memberWithoutAccount', personKey: member.personKey, name: member.name, roles: [] });
  }
  return rows;
}

/** normal rows by default; the three problem kinds with `problems`; `extendedRole` narrows by role. */
export function filterUserAccountRows(
  rows: UserAccountRow[],
  opts: { problems: boolean; extendedRole?: RoleName | 'any' },
): UserAccountRow[] {
  const byKind = rows.filter(r => (r.kind === 'normal') !== opts.problems);
  const role = opts.extendedRole;
  if (!role) return byKind;
  return byKind.filter(r => role === 'any' ? r.roles.some(x => x !== 'registered') : r.roles.includes(role));
}
