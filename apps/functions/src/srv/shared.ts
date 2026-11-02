import { defineSecret } from 'firebase-functions/params';

export { Club, RegasoftMember } from '@okr/shared-models';

export const regasoftApiKey = defineSecret('REGASOFT_APIKEY');
export const regasoftClubId = defineSecret('REGASOFT_CLUBID');

/** The adapters' static `baseUrl`. */
export const REGASOFT_HOST = 'https://regasoft.swissrowing.ch';

/** Test system: a copy of the production database. */
export const REGASOFT_TEST_BASE = `${REGASOFT_HOST}/PortalTest`;
export const REGASOFT_PRODUCTION_BASE = `${REGASOFT_HOST}/Portal`;

/**
 * Which Regasoft the function talks to (spec 1.133 D11). A code constant, not a
 * `defineString` param: a param would prompt on every scripted functions deploy, and the
 * production cutover is a commit + deploy anyway. Switch to 'production' at the production
 * cutover, spec 1.133 §6 (together with the production REGASOFT_APIKEY / REGASOFT_CLUBID).
 */
export const REGASOFT_SYSTEM: 'test' | 'production' = 'test';

/** The base URL of the configured Regasoft system, without a trailing slash. */
export function regasoftBaseUrl(): string {
  return isRegasoftTestSystem() ? REGASOFT_TEST_BASE : REGASOFT_PRODUCTION_BASE;
}

/** True when the function talks to the Regasoft test system. */
export function isRegasoftTestSystem(): boolean {
  // Widened to string so the comparison stays meaningful to tsc while the constant is 'test'.
  return (REGASOFT_SYSTEM as string) === 'test';
}

/**
 * Whether the test system marks every email with a trailing `x` (D11). It did until 2026-11-02;
 * since that evening PortalTest returns the plain addresses (0 of 234 end in `x`). While it is
 * off, emails are read and written unchanged — appending an `x` would now write a wrong address.
 * The API watch reports when the mark comes back (`all.email.testMark`).
 */
export const REGASOFT_TEST_EMAIL_MARK = false;

/** True when emails have to be unmarked on read and marked on write: test system with the mark on. */
export function marksTestEmails(): boolean {
  return isRegasoftTestSystem() && REGASOFT_TEST_EMAIL_MARK;
}
