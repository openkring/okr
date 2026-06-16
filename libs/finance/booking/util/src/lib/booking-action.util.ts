import { BookingAction } from './booking-action.model';

/**
 * Returns every action whose trigger matches the given accounting tenant and
 * whose trigger account number appears among the booking's line account ids.
 */
export function matchActions(
  accountingTenantId: string,
  accountIds: string[],
  actions: BookingAction[],
): BookingAction[] {
  return actions.filter(
    (a) =>
      a.trigger.accountingTenantId === accountingTenantId &&
      accountIds.includes(a.trigger.accountId),
  );
}
