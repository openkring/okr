import { BILLING_EXCLUDED_ROLES, BILLING_PRIVILEGED_ROLES, weightedUsers } from '@okr/business-metering-util';
import { DateFormat, subDuration } from '@okr/shared-util-core';

/** A user reduced to what pricing spec §9.1 looks at. */
export interface UserForCount {
  roles: Record<string, boolean>;
  isArchived?: boolean;
  /** Firebase Auth `disabled` — the model has no such field. */
  disabled?: boolean;
  /** StoreDate (Zurich) of account creation; absent = counts. */
  createdAt?: string;
}

/** Roles that may accompany an excluded role without making the account billable. */
const NEUTRAL_ROLES = ['registered', 'none'];

/**
 * A kiosk-only or tester-only account (§9.1 (4): not a billable person). Tenant admins can write
 * `users/{uid}.roles`, so the exclusion must not be grantable to a real member: the account is
 * excluded only when every true role is `kiosk`, `tester`, `registered` or `none` and at least one
 * excluded role is set. Any other true role (admin, auditor, tripAdmin, ...) makes it count.
 */
function isExcludedAccount(roles: Record<string, boolean> | undefined): boolean {
  const active = Object.keys(roles ?? {}).filter((r) => roles?.[r] === true);
  const hasExcluded = active.some((r) => (BILLING_EXCLUDED_ROLES as readonly string[]).includes(r));
  return hasExcluded && active.every((r) => (BILLING_EXCLUDED_ROLES as readonly string[]).includes(r) || NEUTRAL_ROLES.includes(r));
}

/**
 * §9.1 (3): not archived, not disabled, measured on `lastDay`; (4): the eight privileged roles
 * count double, once per user however many of them the user holds.
 */
export function countUsers(users: UserForCount[], lastDay: string): { totalUsers: number; privilegedUsers: number; excludedUsers: number; weighted: number } {
  let totalUsers = 0;
  let privilegedUsers = 0;
  let excludedUsers = 0;
  for (const user of users) {
    if (user.isArchived || user.disabled) continue;
    // a user created after the measuring day did not exist on it (1.32 §9.1: measured on the last day of the month)
    if (user.createdAt && user.createdAt > lastDay) continue;
    if (isExcludedAccount(user.roles)) {
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
