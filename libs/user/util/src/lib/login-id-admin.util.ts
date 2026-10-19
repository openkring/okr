import { UserModel } from '@okr/shared-models';

/**
 * The user of this tenant whose login email is `email` — the account that currently "holds" a real
 * address another person should get in a swap (spec 1.71 §6b). Compared case-insensitively;
 * `excludeUid` (the newcomer itself) never counts. `users` may span several tenants.
 */
export function findLoginEmailHolder(users: UserModel[], email: string | undefined, tenantId: string, excludeUid?: string): UserModel | undefined {
  const wanted = (email ?? '').trim().toLowerCase();
  if (!wanted) return undefined;
  return users.find(u =>
    u.okey !== excludeUid &&
    (u.tenants ?? []).includes(tenantId) &&
    (u.loginEmail ?? '').trim().toLowerCase() === wanted
  );
}

/**
 * True for a known age under 18. `age` comes from getAge(), which returns -1 when the year of
 * birth is unknown — that is "no hint", not "minor".
 */
export function isMinorAge(age: number): boolean {
  return age >= 0 && age < 18;
}
