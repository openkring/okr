import { defineSecret } from 'firebase-functions/params';

export { Club, RegasoftMember } from '@okr/shared-models';

export const regasoftApiKey = defineSecret('REGASOFT_APIKEY');
export const regasoftClubId = defineSecret('REGASOFT_CLUBID');

/** The adapters' static `baseUrl`. */
export const REGASOFT_HOST = 'https://regasoft.swissrowing.ch';

/** Test system: a copy of the production database whose emails end in an extra `x`. */
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
