import { Roles } from '@okr/shared-models';

/**
 * Pricing §9.1's counting rules, as pure functions.
 *
 * This ships **inside the product** on purpose (§9.1's implementation note): the partner's own
 * installation computes the two numbers it pushes, so "privileged" cannot be reinterpreted per
 * partner. Everything a partner could bend — which roles double, which accounts count at all —
 * lives here and is tested.
 */

/** Roles that make an account count double (pricing §9.1, table row 1). */
export const PRIVILEGED_ROLES: readonly string[] = [
  'privileged', 'admin', 'contentAdmin', 'resourceAdmin', 'memberAdmin', 'eventAdmin',
  'treasurer', 'groupAdmin',
];

/**
 * Roles that are not a billable user at all: a shared device and an internal test account.
 * `tester` is in `RoleName` but not (yet) in the `Roles` map — listed here so it is already
 * exempt on the day it is added, rather than silently billed.
 */
export const NON_BILLABLE_ROLES: readonly string[] = ['kiosk', 'tester'];

export interface CountableUser {
  roles: Roles;
  isArchived: boolean;
  /** Firebase Auth's disabled flag — it is not a Firestore field (pricing §9.1, rule 3). */
  disabled: boolean;
}

export interface UserCounts {
  totalUsers: number;
  privilegedUsers: number;
}

/**
 * Count a tenant's billable accounts on the measurement date.
 *
 * An account with no role at all is **not** billable: it cannot do anything in the product, and
 * charging for it would bill the leftovers of an aborted invitation. An account holding only
 * `kiosk`/`tester` is likewise not billable — but one holding `kiosk` *and* `treasurer` is, because
 * the person is really using the product; the non-billable roles are an exemption, not a veto.
 */
export function countBillableUsers(users: readonly CountableUser[]): UserCounts {
  let totalUsers = 0;
  let privilegedUsers = 0;
  for (const user of users) {
    if (user.isArchived || user.disabled) continue;
    const roles = (user.roles ?? {}) as Record<string, boolean | undefined>;
    const held = Object.keys(roles).filter(r => roles[r] === true);
    if (held.every(r => NON_BILLABLE_ROLES.includes(r))) continue;   // covers "no roles at all"
    totalUsers++;
    if (held.some(r => PRIVILEGED_ROLES.includes(r))) privilegedUsers++;
  }
  return { totalUsers, privilegedUsers };
}
