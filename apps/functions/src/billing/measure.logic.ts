import { BILLING_PRIVILEGED_ROLES, weightedUsers } from '@okr/business-metering-util';
import { DateFormat, subDuration } from '@okr/shared-util-core';

/** A user reduced to what pricing spec §9.1 looks at. */
export interface UserForCount {
  uid?: string;
  roles: Record<string, boolean>;
  isArchived?: boolean;
  /** Firebase Auth `disabled` — the model has no such field. */
  disabled?: boolean;
  /** StoreDate (Zurich) of account creation; absent = counts. */
  createdAt?: string;
}

/**
 * Kiosk-only: `kiosk` is true and no other role is true (mirrors `isKioskOnly()` in shared-util-core).
 * Tenant admins can write `users/{uid}.roles`, so a lone-role test is the only one a member cannot
 * pick up without losing every other right; `registered` + `kiosk` is an unlocked full member.
 */
function isKioskOnlyAccount(roles: Record<string, boolean> | undefined): boolean {
  if (!roles || roles['kiosk'] !== true) return false;
  return Object.entries(roles).every(([key, value]) => key === 'kiosk' || value !== true);
}

/**
 * §9.1 (3): not archived, not disabled, measured on `lastDay`; (4): the eight privileged roles
 * count double, once per user however many of them the user holds. Excluded: kiosk-only accounts and
 * the operator-listed `excludedUids` (internal test accounts).
 */
export function countUsers(users: UserForCount[], lastDay: string, excludedUids: readonly string[] = []): { totalUsers: number; privilegedUsers: number; excludedUsers: number; weighted: number } {
  let totalUsers = 0;
  let privilegedUsers = 0;
  let excludedUsers = 0;
  for (const user of users) {
    if (user.isArchived || user.disabled) continue;
    // a user created after the measuring day did not exist on it (1.32 §9.1: measured on the last day of the month)
    if (user.createdAt && user.createdAt > lastDay) continue;
    if (isKioskOnlyAccount(user.roles) || (user.uid !== undefined && excludedUids.includes(user.uid))) {
      excludedUsers++;
      continue;
    }
    totalUsers++;
    if (BILLING_PRIVILEGED_ROLES.some((role) => user.roles?.[role] === true)) privilegedUsers++;
  }
  return { totalUsers, privilegedUsers, excludedUsers, weighted: weightedUsers(totalUsers, privilegedUsers) };
}

/** The measurement instant for a run on `runDate`: the last day of the month before it. */
export function lastDayOfPreviousMonth(runDate: string): string {
  const firstOfMonth = `${runDate.slice(0, 6)}01`;
  return subDuration(firstOfMonth, { days: 1 }, DateFormat.StoreDate);
}
