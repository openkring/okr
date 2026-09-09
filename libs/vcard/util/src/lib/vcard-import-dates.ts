import { classifyStoreDate, STORE_DATE_FILLER } from '@okr/shared-util-core';

/**
 * Convert a vCard BDAY/DEATHDATE value into a StoreDate (spec §4.5).
 * All three precisions classifyStoreDate models are supported:
 *   '1985-04-15' -> '19850415' (full)
 *   '--0415'     -> '00000415' (dayMonthOnly)
 *   '1985'       -> '19850000' (yearOnly)
 * Validity is decided by classifyStoreDate — never by constructing a Date,
 * because parseDate returns an Invalid Date *object* rather than null.
 * Returns '' when the value cannot be represented.
 */
export function vcardDateToStoreDate(raw: string | undefined): string {
  if (!raw) return '';
  const v = raw.trim().split('T')[0];

  const full = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);
  if (full) return accept(`${full[1]}${full[2]}${full[3]}`, 'full');

  const dayMonth = /^--(\d{2})-?(\d{2})$/.exec(v);
  if (dayMonth) return accept(`${STORE_DATE_FILLER}${dayMonth[1]}${dayMonth[2]}`, 'dayMonthOnly');

  const yearOnly = /^(\d{4})$/.exec(v);
  if (yearOnly) return accept(`${yearOnly[1]}${STORE_DATE_FILLER}`, 'yearOnly');

  return '';
}

function accept(candidate: string, expected: 'full' | 'dayMonthOnly' | 'yearOnly'): string {
  return classifyStoreDate(candidate) === expected ? candidate : '';
}
