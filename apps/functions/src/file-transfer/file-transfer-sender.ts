import type { UserModel } from '@okr/shared-models';
import { hasRole, isKioskOnly } from '@okr/shared-util-core';

/**
 * Who may prepare, send and ask for higher limits (spec 1.115 §4.2): every registered user of the
 * tenant except kiosk-only users. "Registered" is the role HIERARCHY of `hasRole` — an admin whose
 * `users` doc carries only `roles.admin` is registered too. A literal `roles.registered === true`
 * check refused exactly those admins with a 403 while the app (which uses `hasRole`) offered them
 * the send form.
 *
 * `roles` is normalised first: `hasRole`/`isKioskOnly` index into it, and a `users` doc without
 * the field must end in a clean «no», not a TypeError (= HTTP 500).
 */
export function mayCreateFileTransfer(user: Partial<UserModel> | undefined): boolean {
  if (!user) return false;
  const caller = { ...user, roles: user.roles ?? {} } as UserModel;
  return hasRole('registered', caller) && !isKioskOnly(caller);
}
