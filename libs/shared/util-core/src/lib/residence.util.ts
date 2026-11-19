import { AddressModel } from '@okr/shared-models';
import { DateFormat, getTodayStr, isAfterDate, subDuration } from './date.util';

export type ResidenceStatus = 'current' | 'future' | 'past';

/**
 * Where a dated residence stands relative to today. Both bounds are inclusive; '' means open.
 * StoreDate strings: validFrom/validTo are compared with isAfterDate.
 */
export function residenceStatus(row: Pick<AddressModel, 'validFrom' | 'validTo'>, today = getTodayStr(DateFormat.StoreDate)): ResidenceStatus {
  if (row.validFrom && isAfterDate(row.validFrom, today)) return 'future';
  if (row.validTo && isAfterDate(today, row.validTo)) return 'past';
  return 'current';
}

/** A non-archived postal address row (a residence candidate). */
export function isPostalResidence(row: AddressModel): boolean {
  return row.addressChannel === 'postal' && !row.isArchived;
}

export function currentPostalRows(rows: AddressModel[], today = getTodayStr(DateFormat.StoreDate)): AddressModel[] {
  return rows.filter(row => isPostalResidence(row) && residenceStatus(row, today) === 'current');
}

/** The favorite among the current postal rows, else the first current one by okey; never a past or future row. */
export function pickCurrentFavoritePostal(rows: AddressModel[], today = getTodayStr(DateFormat.StoreDate)): AddressModel | undefined {
  const current = currentPostalRows(rows, today);
  return current.find(row => row.isFavorite) ?? [...current].sort((a, b) => a.okey.localeCompare(b.okey))[0];
}

/** The StoreDate one day before the given StoreDate (closing the previous residence when a new one starts). */
export function dayBefore(storeDate: string): string {
  return subDuration(storeDate, { days: 1 });
}
