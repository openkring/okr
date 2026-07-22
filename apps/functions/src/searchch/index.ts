import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import axios from 'axios';

import { parseTelFeed, PersonDirectoryResult } from './parse';

export type { PersonDirectoryResult };

const SEARCH_CH_BASE = 'https://tel.search.ch/api/';

interface SearchPersonData {
  tenantId: string;
  firstName: string;
  lastName: string;
  location?: string;
}

/**
 * Look up a person in the search.ch directory by first + last name.
 * The tenant's API key is read server-side from app-secrets/{tenantId} and never
 * leaves the backend. Requires an authenticated caller and passes AppCheck.
 */
export const searchChSearchPerson = onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request: CallableRequest<SearchPersonData>) => {
    const CF_NAME = 'searchChSearchPerson';
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'authentication required');
    }
    const { tenantId, firstName, lastName, location } = request.data;
    if (!tenantId || tenantId.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'tenantId is required');
    }
    const name = `${(firstName ?? '').trim()} ${(lastName ?? '').trim()}`.trim();
    if (name.length === 0) {
      throw new HttpsError('invalid-argument', 'firstName or lastName is required');
    }

    // Verify the caller actually belongs to the requested tenant — prevents using
    // another tenant's search.ch key/quota by passing a foreign tenantId.
    const callerSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const callerTenants = callerSnap.data()?.tenants;
    if (!Array.isArray(callerTenants) || !callerTenants.includes(tenantId)) {
      throw new HttpsError('permission-denied', 'caller does not belong to tenant');
    }

    // read the tenant's search.ch key (server-only doc, admin SDK bypasses rules)
    const snap = await admin.firestore().doc(`app-secrets/${tenantId}`).get();
    const key = snap.exists ? (snap.data()?.['searchChApiKey'] as string | undefined) : undefined;
    if (!key || key.trim().length === 0) {
      throw new HttpsError('failed-precondition', 'no search.ch key configured for tenant');
    }

    // Do NOT log the searched person name — PII (privacy inventory §7.2).
    logger.info(`${CF_NAME}: searching (tenant ${tenantId})`);
    try {
      const response = await axios.get(SEARCH_CH_BASE, {
        params: {
          was: name,
          wo: (location ?? '').trim() || undefined,
          key: key.trim(),
          maxnum: 20,
          lang: 'de',
        },
        responseType: 'text',
      });
      const results: PersonDirectoryResult[] = parseTelFeed(String(response.data));
      logger.info(`${CF_NAME}: found ${results.length} result(s)`);
      return { results };
    } catch (error: unknown) {
      if (error instanceof HttpsError) throw error;
      logger.error(`${CF_NAME}: error`, {
        message: error instanceof Error ? error.message : String(error),
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
      });
      throw new HttpsError('internal', 'search.ch lookup failed');
    }
  }
);
