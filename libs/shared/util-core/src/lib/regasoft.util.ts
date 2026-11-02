import { classifyStoreDate, convertDateFormatToString, DateFormat } from './date.util';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { SrvIndex, SrvMismatch } from '@okr/shared-models';

/**
 * Convert StoreDate "YYYYMMDD" → Regasoft ISO datetime "YYYY-MM-DDTHH:mm:ss". Returns null for
 * empty input AND for a partial date (year-only or birthday-without-year) — Regasoft has no
 * partial-date representation, and converting one would reach format() with an Invalid Date
 * and throw (parseDate only returns null for the end-future sentinel, not for a structurally
 * partial StoreDate).
 */
export function storeDateToRegasoftDate(storeDate: string | undefined): string | null {
  if (!storeDate || storeDate.length < 8) return null;
  if (classifyStoreDate(storeDate.substring(0, 8)) !== 'full') return null;
  const isoDate = convertDateFormatToString(storeDate.substring(0, 8), DateFormat.StoreDate, DateFormat.IsoDate, false);
  return isoDate ? `${isoDate}T00:00:00` : null;
}

/** Convert Regasoft ISO datetime "YYYY-MM-DDTHH:mm:ss" → StoreDate "YYYYMMDD". Returns '' for null. */
export function regasoftDateToStoreDate(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return '';
  const isoDate = isoDateTime.length > 10 ? isoDateTime.substring(0, 10) : isoDateTime;
  return convertDateFormatToString(isoDate, DateFormat.IsoDate, DateFormat.StoreDate, false);
}

/**
 * Normalise a phone number for comparison: digits only, Swiss `+41` / `0041` → national `0`,
 * a `(0)` right after the country code dropped, any other `+CC` → `00CC`. Empty → ''.
 */
export function normalizePhone(n: string): string {
  const trimmed = (n ?? '').trim();
  if (!trimmed) return '';
  // «(0)» after the country code must go before the parentheses are stripped.
  const withoutTrunk = trimmed.replace(/^(\+|00)(\d{1,3})\s*\(0\)/, '$1$2');
  const hasPlus = withoutTrunk.startsWith('+');
  const digits = withoutTrunk.replace(/\D/g, '');
  if (!digits) return '';
  const international = hasPlus ? `00${digits}` : digits;
  return international.startsWith('0041') ? `0${international.substring(4)}` : international;
}

/** D4: a normalised number starting `07x` is a mobile, everything else a landline (`telefon`). */
export function classifyPhone(n: string): 'mobile' | 'telefon' {
  return /^07\d/.test(normalizePhone(n)) ? 'mobile' : 'telefon';
}

/** The BK number matches if it equals either Regasoft field; no number on either side is a match. */
export function phonesMatch(bk: string, rMobile: string, rTelefon: string): boolean {
  const b = normalizePhone(bk);
  const m = normalizePhone(rMobile);
  const t = normalizePhone(rTelefon);
  if (!b) return !m && !t;
  return b === m || b === t;
}

/** BK country code → Regasoft country id. Extend from observed records; replace with Regasoft's list (Q3). */
export const REGASOFT_COUNTRY_IDS: Record<string, number> = { CH: 3 };

export function countryIdOf(code: string): number | null {
  return REGASOFT_COUNTRY_IDS[(code ?? '').trim().toUpperCase()] ?? null;
}

/**
 * The Regasoft status dates a member should have (StoreDates, '' = empty). Death wins over
 * exit, exit over passive. An exit counts only as a full date that is not in the future
 * (an announced exit must not drop the member out of Regasoft early) and not the no-exit
 * sentinel. A passive member (category 'P') is inactive since `passiveSince`, else `today` (spec Q4).
 */
export function expectedSrvStatus(s: {
  dateOfDeath: string;
  dateOfExit: string;
  category: string;
  passiveSince: string;
  today: string;
}): { leavingDate: string; dateOfDeath: string; inactiveDate: string } {
  const none = { leavingDate: '', dateOfDeath: '', inactiveDate: '' };
  if (classifyStoreDate(s.dateOfDeath) === 'full') return { ...none, dateOfDeath: s.dateOfDeath };
  if (s.dateOfExit !== END_FUTURE_DATE_STR && classifyStoreDate(s.dateOfExit) === 'full' && s.dateOfExit <= s.today) {
    return { ...none, leavingDate: s.dateOfExit };
  }
  if (s.category === 'P') return { ...none, inactiveDate: s.passiveSince || s.today };
  return none;
}

/** Return all BK ↔ Regasoft field mismatches for a single index entry. */
export function getMismatches(item: SrvIndex): SrvMismatch[] {
  if (!item.rid) return [];

  const result: SrvMismatch[] = [];

  const chk = (field: string, bk: string, r: string, kind: SrvMismatch['kind'] = 'fix') => {
    if (r && bk !== r) result.push({ field, okrValue: bk, rValue: r, kind });
  };
  const chkPhone = (field: string, bk: string, r: string) => {
    const norm = (s: string) => s.replace(/\s/g, '');
    if (r && norm(bk) !== norm(r)) result.push({ field, okrValue: bk, rValue: r, kind: 'fix' });
  };
  const chkCI = (field: string, bk: string, r: string) => {
    if (r && bk.toLowerCase() !== r.toLowerCase()) result.push({ field, okrValue: bk, rValue: r, kind: 'fix' });
  };
  // A partial date (year only, or a birthday without a year) cannot be compared to
  // Regasoft's full date. Reporting it would create a permanent, unresolvable mismatch.
  const chkDate = (field: string, bk: string, r: string) => {
    if (classifyStoreDate(bk) !== 'full' || classifyStoreDate(r) !== 'full') return;
    if (bk !== r) result.push({ field, okrValue: bk, rValue: r, kind: 'fix' });
  };

  chk('firstName',   item.firstName,   item.rFirstName);
  chk('lastName',    item.lastName,    item.rLastName);
  chk('memberId',    item.memberId,    item.rServiceId, 'bk');
  chk('email',       item.mEmail,      item.rEmail);
  chkPhone('phone',  item.mPhone,      item.rMobile || item.rTelefon);
  chkCI('street',    item.mStreet,     item.rStreet);
  chk('zipCode',     item.mZipCode,    item.rZipCode);
  chkCI('city',      item.mCity,       item.rCity);
  chkDate('dateOfBirth', item.dateOfBirth, item.rDateOfBirth);

  if (item.pKey) {
    const expectedCat = item.mainClub ? item.rCategory : 'D';
    if (expectedCat && item.pCategory !== expectedCat) {
      result.push({ field: 'pCategory', okrValue: item.pCategory, rValue: expectedCat, kind: 'bk' });
    }
  }

  return result;
}
