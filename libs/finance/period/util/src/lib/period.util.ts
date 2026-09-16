import { PeriodModel } from '@okr/shared-models';
import { fiscalYear } from '@okr/finance-reporting-util';

/** Inclusive yyyymmdd StoreDate bounds of a period. */
export interface PeriodRange {
  from: string;
  to: string;
}

/**
 * The booking range a period covers: a monthly period is the calendar month, an annual period
 * is the whole fiscal year (which may start in a month other than January — see `fiscalYear`).
 */
export function periodRange(period: PeriodModel, fiscalYearStart = 1): PeriodRange {
  if (period.month > 0) {
    const month = String(period.month).padStart(2, '0');
    const lastDay = new Date(period.year, period.month, 0).getDate();
    return { from: `${period.year}${month}01`, to: `${period.year}${month}${String(lastDay).padStart(2, '0')}` };
  }
  const fy = fiscalYear(period.year, fiscalYearStart);
  return { from: fy.from, to: fy.to };
}
