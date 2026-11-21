/**
 * Mailchimp import (spec 1.169 §5.10): the pure part — re-validating the rows the client parsed and the
 * summary. The Firestore side lives in `import.ts`. Nothing here ever returns or logs an address.
 */
import { normalizeEmail } from './subscriber.logic';

/** At most this many rows per call. */
export const MAX_IMPORT_ROWS = 2000;
/** Mailchimp timestamps are short; anything longer is not one and is not stored. */
const MAX_FIELD = 64;
const MAX_NAME = 200;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ImportRow {
  email: string;
  firstName: string;
  lastName: string;
  optinAt: string;
  confirmAt: string;
}

export interface ImportSummary {
  imported: number;
  alreadySubscribed: number;
  matchedExisting: number;
  ambiguous: number;
  invalid: number;
}

export const emptySummary = (): ImportSummary => ({ imported: 0, alreadySubscribed: 0, matchedExisting: 0, ambiguous: 0, invalid: 0 });

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The row with checked types and a normalised address, or undefined when the email is missing or malformed. */
export function validateImportRow(raw: unknown): ImportRow | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const email = normalizeEmail(str(r['email'], 320));
  if (!EMAIL_SHAPE.test(email)) return undefined;
  return {
    email,
    firstName: str(r['firstName'], MAX_NAME),
    lastName: str(r['lastName'], MAX_NAME),
    optinAt: str(r['optinAt'], MAX_FIELD),
    confirmAt: str(r['confirmAt'], MAX_FIELD),
  };
}

/**
 * `dateOfEntry` (StoreDate): the date of Mailchimp's `CONFIRM_TIME` when it parses (`2020-03-14 15:09:26`,
 * `2020-03-14T15:09:26Z` or `14.03.2020`), else `today`. Impossible dates (month 13, 31 February) do not parse.
 */
export function entryDate(confirmAt: string, today: string): string {
  const s = confirmAt.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(s);
  const swiss = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : swiss ? [swiss[3], swiss[2].padStart(2, '0'), swiss[1].padStart(2, '0')] : ['', '', ''];
  if (y === '') return today;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const valid = date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
  return valid ? `${y}${m}${d}` : today;
}

/** Adds one `subscribePerson` result to the summary. */
export function countResult(summary: ImportSummary, result: { outcome: 'subscribed' | 'alreadySubscribed' | 'ambiguous'; matchedExisting: boolean }): void {
  if (result.outcome === 'subscribed') {
    if (result.matchedExisting) summary.matchedExisting++;
    else summary.imported++;
  } else if (result.outcome === 'alreadySubscribed') summary.alreadySubscribed++;
  else summary.ambiguous++;
}
