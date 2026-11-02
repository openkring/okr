import { HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';

export { Club, RegasoftMember } from '@okr/shared-models';

export const regasoftApiKey = defineSecret('REGASOFT_APIKEY');
export const regasoftClubId = defineSecret('REGASOFT_CLUBID');

/** The only host the Regasoft credentials are ever sent to. Also the adapters' static `baseUrl`. */
export const REGASOFT_HOST = 'https://regasoft.swissrowing.ch';

const REGASOFT_TEST_BASE = `${REGASOFT_HOST}/PortalTest`;

/**
 * Which Regasoft the function talks to (spec 1.133 D11): `/PortalTest` (test system, a copy of
 * the production database whose emails end in an extra `x`) or `/Portal` (production).
 * Read it only at call time via `regasoftBaseUrl()`, never at module load.
 */
export const regasoftBase = defineString('REGASOFT_BASE', { default: REGASOFT_TEST_BASE });

/**
 * The configured Regasoft base URL, without a trailing slash. An empty setting falls back to the
 * test system (the safe direction). A base on any other host is refused: the API key and club id
 * travel in every request header.
 */
export function regasoftBaseUrl(): string {
  const base = (regasoftBase.value() || REGASOFT_TEST_BASE).trim().replace(/\/+$/, '');
  if (!base.startsWith(`${REGASOFT_HOST}/`)) {
    throw new HttpsError('failed-precondition', `REGASOFT_BASE must point to ${REGASOFT_HOST}`);
  }
  return base;
}

/** True when the function talks to the Regasoft test system (base ends in `/PortalTest`). */
export function isRegasoftTestSystem(): boolean {
  return regasoftBaseUrl().toLowerCase().endsWith('/portaltest');
}
