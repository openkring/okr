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

/*-------------------------- pro rata (spec 1.79) --------------------------------*/
const PRO_RATA_STORE_DATE = /^\d{8}$/;

/** The month (1–12) of a StoreDate when it falls in `year`, otherwise undefined. */
function monthIn(date: string, year: number): number | undefined {
  if (!PRO_RATA_STORE_DATE.test(date ?? '')) return undefined;
  return Number(date.substring(0, 4)) === year ? Number(date.substring(4, 6)) : undefined;
}

/**
 * Months of membership in `year`, counted inclusively (spec 1.79 P2): entry month to December in
 * the entry year, January to the exit month in the exit year. 12 when neither falls in the year
 * (also for an empty or unparsable date), 0 when the member is outside the year altogether.
 */
export function proRataMonths(entry: string, exit: string, year: number): number {
  const entryYear = PRO_RATA_STORE_DATE.test(entry ?? '') ? Number(entry.substring(0, 4)) : 0;
  const exitYear = PRO_RATA_STORE_DATE.test(exit ?? '') ? Number(exit.substring(0, 4)) : 0;
  if (entryYear > year || (exitYear > 0 && exitYear < year)) return 0;
  const start = monthIn(entry, year) ?? 1;
  const end = monthIn(exit, year) ?? 12;
  return Math.max(0, end - start + 1);
}

/**
 * The text printed under a pro-rata position on the invoice: the months billed and, when known, the
 * full yearly price it was scaled from. German: it goes onto the PDF as is.
 */
export function proRataDescription(months: number, yearlyAmount?: number): string {
  const text = `pro rata verrechnet für ${months} von 12 Monaten`;
  return yearlyAmount === undefined ? text : `${text} (voller Jahresbetrag CHF ${yearlyAmount.toFixed(2)})`;
}
