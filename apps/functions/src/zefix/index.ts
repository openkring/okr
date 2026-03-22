import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';

const zefixUid = defineSecret('ZEFIX_UID');
const zefixPwd = defineSecret('ZEFIX_PWD');

//const ZEFIX_BASE = 'https://www.zefix.admin.ch/ZefixREST/api/v1';
const ZEFIX_BASE = 'https://www.zefixintg.admin.ch/ZefixPublicREST/api/v1';

const LEGAL_FORM_NAMES: Record<number, string> = {
  1: 'Einzelunternehmen',
  2: 'Kollektivgesellschaft',
  3: 'AG',
  4: 'GmbH',
  5: 'Genossenschaft',
  6: 'Verein',
  7: 'Stiftung',
  8: 'Institut des öffentlichen Rechts',
};

function basicAuthHeader(uid: string, pwd: string): string {
  return 'Basic ' + Buffer.from(`${uid}:${pwd}`).toString('base64');
}

function extractUidString(uid: unknown): string {
  if (typeof uid === 'string') return uid;
  if (uid && typeof uid === 'object' && 'uid' in uid) return String((uid as { uid: string }).uid);
  return '';
}

export interface ZefixSearchResult {
  name: string;
  legalSeat: string;
  uid: string;
}

export interface ZefixCompanyDetails {
  name: string;
  taxId: string;
  streetName: string;
  streetNumber: string;
  countryCode: string;
  zipCode: string;
  city: string;
  notes: string;
}

/**
 * Search companies in the Zefix registry by name.
 * Returns an array of matching results with name, legalSeat and uid.
 */
export const zefixSearch = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [zefixUid, zefixPwd],
  },
  async (request: CallableRequest<{ name: string }>) => {
    const CF_NAME = 'zefixSearch';
    const { name } = request.data;
    if (!name || name.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'name is required');
    }

    logger.info(`${CF_NAME}: searching for "${name}"`);
    try {
      const response = await axios.post(
        `${ZEFIX_BASE}/company/search`,
        { name: name.trim(), maxEntries: 20, offset: 0 },
        {
          headers: {
            Authorization: basicAuthHeader(zefixUid.value(), zefixPwd.value()),
            'Content-Type': 'application/json',
          },
        }
      );

      // The Zefix API may return a direct array or an object with a `list` property
      const raw: unknown[] = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.list)
          ? response.data.list
          : [];

      const results: ZefixSearchResult[] = raw.map((c: unknown) => {
        const company = c as Record<string, unknown>;
        return {
          name: String(company['name'] ?? ''),
          legalSeat: String(company['legalSeat'] ?? ''),
          uid: extractUidString(company['uid']),
        };
      });

      logger.info(`${CF_NAME}: found ${results.length} result(s)`);
      return { results };
    } catch (error: unknown) {
      logger.error(`${CF_NAME}: error`, error);
      throw new HttpsError('internal', 'Zefix search failed');
    }
  }
);

/**
 * Retrieve full company details from Zefix by UID and return mapped form fields.
 */
export const zefixGetByUid = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [zefixUid, zefixPwd],
  },
  async (request: CallableRequest<{ uid: string }>) => {
    const CF_NAME = 'zefixGetByUid';
    const { uid } = request.data;
    if (!uid || uid.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'uid is required');
    }

    logger.info(`${CF_NAME}: fetching details for uid "${uid}"`);
    try {
      const response = await axios.get(
        `${ZEFIX_BASE}/company/uid/${encodeURIComponent(uid.trim())}`,
        {
          headers: {
            Authorization: basicAuthHeader(zefixUid.value(), zefixPwd.value()),
          },
        }
      );

      // The endpoint may return a single object or an array — normalise to a single entry
      const raw = response.data;
      const c: Record<string, unknown> = Array.isArray(raw) ? (raw[0] as Record<string, unknown>) : (raw as Record<string, unknown>);
      if (!c) throw new HttpsError('not-found', `No company found for uid "${uid}"`);
      logger.info(`${CF_NAME}: raw response keys: ${Object.keys(c).join(', ')}`);

      const address = (c['address'] as Record<string, unknown>) ?? {};

      const legalFormId =
        typeof c['legalFormId'] === 'number'
          ? c['legalFormId']
          : typeof (c['legalForm'] as Record<string, unknown> | undefined)?.['id'] === 'number'
            ? ((c['legalForm'] as Record<string, unknown>)['id'] as number)
            : 0;
      const legalFormName = LEGAL_FORM_NAMES[legalFormId] ?? '';

      const noteParts: string[] = [];
      if (c['purpose'] && String(c['purpose']).trim().length > 0) {
        noteParts.push(String(c['purpose']).trim());
      }
      if (legalFormName) {
        noteParts.push(`Rechtsform: ${legalFormName}`);
      }

      const zipCode = address['swissZipCode'] != null ? String(address['swissZipCode']) : '';

      const details: ZefixCompanyDetails = {
        name: String(c['name'] ?? ''),
        taxId: extractUidString(c['uid']) || uid,
        streetName: String(address['street'] ?? ''),
        streetNumber: String(address['houseNumber'] ?? ''),
        countryCode: 'CH',
        zipCode,
        city: String(address['city'] ?? ''),
        notes: noteParts.join('\n'),
      };

      logger.info(`${CF_NAME}: details retrieved for "${details.name}"`);
      return details;
    } catch (error: unknown) {
      logger.error(`${CF_NAME}: error`, error);
      throw new HttpsError('internal', 'Zefix lookup failed');
    }
  }
);
