import { isAfterDate } from './date.util';

/**
 * Structural subset of MembershipModel — deliberately NOT importing @okr/shared-models.
 * Cloud Functions inline their model interfaces to avoid monorepo cross-bundle imports
 * (see membership-sync.ts), so this predicate must be usable from both sides.
 */
export interface ActiveMembershipFields {
  isArchived?: boolean;
  dateOfExit?: string;
}

/**
 * The single definition of "this membership is active today".
 *
 * A membership is active when it is not archived and either never ended
 * (dateOfExit === '') or its exit date is still in the future. isAfterDate
 * short-circuits END_FUTURE_DATE_STR ('99991231') to true, so the open-end
 * sentinel written by MembershipService.endMembershipByDate needs no special case.
 *
 * @param m       membership fields, may be undefined (a deleted document)
 * @param today   today in StoreDate format (yyyyMMdd), e.g. getTodayStr()
 */
export function isActiveMembership(m: ActiveMembershipFields | undefined, today: string): boolean {
  if (!m || m.isArchived) return false;
  const exit = m.dateOfExit ?? '';
  return exit === '' || isAfterDate(exit, today);
}
