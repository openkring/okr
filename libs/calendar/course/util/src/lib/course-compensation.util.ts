import { AvatarInfo, CalEventModel, CourseFinanceModel, MoneyModel } from '@okr/shared-models';

import { courseEvents } from './course-table.util';

/** One line of the compensation: a person, the trainings they led, the rate per led training and the amount in minor units (Rappen). */
export type CompensationLine = { person: AvatarInfo; ledCount: number; rate: MoneyModel; amount: number };

function ledPersonKeys(e: CalEventModel): string[] {
  return Object.entries(e.attendance ?? {})
    .filter(([, a]) => a.presence === 'present' && a.function === 'leader')
    .map(([key]) => key);
}

/** The trainings a person led: counted events (not archived, not cancelled) where they were `present` as `leader` (§7.6). */
export function countLedTrainings(events: CalEventModel[], personKey: string): number {
  return courseEvents(events).filter(e => ledPersonKeys(e).includes(personKey)).length;
}

/**
 * The compensation per eligible person, in the order of `finance.eligible`: led trainings x rate (own rate, else the
 * default rate). The rate is always per led training; `MoneyModel.periodicity` is never read. An eligible person
 * without a led training still gets a line with amount 0. Amounts are integers in minor units.
 */
export function computeCompensation(events: CalEventModel[], finance: CourseFinanceModel): CompensationLine[] {
  return (finance.eligible ?? []).map(({ person, rate }) => {
    const effective = rate ?? finance.defaultRate;
    const ledCount = countLedTrainings(events, person.key);
    return { person, ledCount, rate: effective, amount: ledCount * effective.amount };
  });
}

/** Persons who led at least one counted training but are not in `finance.eligible` (the §7.6 marker), in order of first appearance. */
export function unlistedLeaders(events: CalEventModel[], finance: CourseFinanceModel): AvatarInfo[] {
  const eligibleKeys = new Set((finance.eligible ?? []).map(e => e.person.key));
  const seen = new Set<string>();
  const result: AvatarInfo[] = [];
  for (const e of courseEvents(events)) {
    for (const key of ledPersonKeys(e)) {
      if (eligibleKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      result.push((e.attendance ?? {})[key].person);
    }
  }
  return result;
}

/** Sums posted bookings per calendar year of the booking date (StoreDate `yyyyMMdd`) and person: year → personKey → amount (§7.7). */
export function yearlyTotals(postedBookings: { date: string; personKey: string; amount: number }[]): Record<string, Record<string, number>> {
  const totals: Record<string, Record<string, number>> = {};
  for (const b of postedBookings) {
    const year = b.date.slice(0, 4);
    const perPerson = totals[year] ?? (totals[year] = {});
    perPerson[b.personKey] = (perPerson[b.personKey] ?? 0) + b.amount;
  }
  return totals;
}
