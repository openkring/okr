import { BILLING_PRIVILEGED_ROLES, weightedUsers } from '@okr/business-metering-util';
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

/**
 * §9.1 (3): not archived, not disabled, measured on `lastDay`; (4): the eight privileged roles
 * count double, once per user however many of them the user holds.
 */
export function countUsers(users: UserForCount[], lastDay: string): { totalUsers: number; privilegedUsers: number; weighted: number } {
  let totalUsers = 0;
  let privilegedUsers = 0;
  for (const user of users) {
    if (user.isArchived || user.disabled) continue;
    if (user.createdAt && user.createdAt > lastDay) continue;
    totalUsers++;
    if (BILLING_PRIVILEGED_ROLES.some((role) => user.roles?.[role] === true)) privilegedUsers++;
  }
  return { totalUsers, privilegedUsers, weighted: weightedUsers(totalUsers, privilegedUsers) };
}

/** The measurement instant for a run on `runDate`: the last day of the month before it. */
export function lastDayOfPreviousMonth(runDate: string): string {
  const firstOfMonth = `${runDate.slice(0, 6)}01`;
  return subDuration(firstOfMonth, { days: 1 }, DateFormat.StoreDate);
}
