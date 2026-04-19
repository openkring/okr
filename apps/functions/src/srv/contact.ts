import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

import { regasoftApiKey, regasoftClubId, REGASOFT_BASE, RegasoftMember } from './shared';

function regasoftHeaders(apiKey: string, clubId: string) {
  return {
    'Content-Type': 'application/json',
    'ApiKey': apiKey,
    'ClubId': clubId,
  };
}

/** Convert StoreDate "YYYYMMDD" to Regasoft ISO datetime "YYYY-MM-DDTHH:mm:ss". Returns null for empty. */
function storeDateToRegasoftDate(storeDate: string | undefined): string | null {
  if (!storeDate || storeDate.length < 8) return null;
  const isoDate = convertDateFormatToString(storeDate.substring(0, 8), DateFormat.StoreDate, DateFormat.IsoDate, false);
  return isoDate ? `${isoDate}T00:00:00` : null;
}

/** Convert Regasoft ISO datetime "YYYY-MM-DDTHH:mm:ss" to StoreDate "YYYYMMDD". Returns '' for null. */
function regasoftDateToStoreDate(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return '';
  const isoDate = isoDateTime.length > 10 ? isoDateTime.substring(0, 10) : isoDateTime;
  return convertDateFormatToString(isoDate, DateFormat.IsoDate, DateFormat.StoreDate, false);
}

export interface SrvContactData {
  srvId?: number;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  dateOfBirth: string;   // StoreDate YYYYMMDD
  gender: number;        // 1=male, 2=female
}

/**
 * Fetch all members from the Regasoft SRV API.
 */
export const getSrvContacts = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [regasoftApiKey, regasoftClubId],
  },
  async (request: CallableRequest) => {
    const CF_NAME = 'getSrvContacts';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    logger.info(`${CF_NAME}: fetching all SRV members`);

    try {
      const response = await axios.get<RegasoftMember[]>(`${REGASOFT_BASE}/api/club/members`, {
        headers: regasoftHeaders(regasoftApiKey.value(), regasoftClubId.value()),
      });

      const members = Array.isArray(response.data) ? response.data : [];
      logger.info(`${CF_NAME}: fetched ${members.length} members`);

      return members.map(m => ({
        srvId: m.id,
        serviceId: m.serviceId,
        firstName: m.firstName,
        lastName: m.lastName,
        fullname: m.fullname,
        email: m.email,
        mobile: m.mobile,
        dateOfBirth: regasoftDateToStoreDate(m.birthday),
        gender: m.gender,
        hasLicense: m.hasLicense,
        membershipType: m.membershipType,
        nationIOC: m.nationIOC,
        mainClub: m.mainClub,
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Regasoft API error ${status}: ${body}`);
        throw new HttpsError('internal', `Regasoft API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Regasoft API request failed');
    }
  }
);

/**
 * Create a new member in the Regasoft SRV API.
 * Returns the newly assigned SRV member ID.
 */
export const createSrvContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [regasoftApiKey, regasoftClubId],
  },
  async (request: CallableRequest<SrvContactData>) => {
    const CF_NAME = 'createSrvContact';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { firstName, lastName, email, mobile, dateOfBirth, gender } = request.data;
    if (!firstName || !lastName) {
      throw new HttpsError('invalid-argument', 'firstName and lastName are required');
    }

    logger.info(`${CF_NAME}: creating SRV member "${firstName} ${lastName}"`);

    const payload: Partial<RegasoftMember> = {
      id: 0,
      firstName,
      lastName,
      email: email ?? null,
      mobile: mobile ?? null,
      birthday: storeDateToRegasoftDate(dateOfBirth),
      gender,
    };

    try {
      const response = await axios.post<RegasoftMember>(
        `${REGASOFT_BASE}/api/club/members`,
        payload,
        { headers: regasoftHeaders(regasoftApiKey.value(), regasoftClubId.value()) }
      );

      logger.info(`${CF_NAME}: created SRV member with id ${response.data.id}`);
      return { id: String(response.data.id) };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Regasoft API error ${status}: ${body}`);
        throw new HttpsError('internal', `Regasoft API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Regasoft member creation failed');
    }
  }
);

/**
 * Update an existing member in the Regasoft SRV API.
 */
export const updateSrvContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [regasoftApiKey, regasoftClubId],
  },
  async (request: CallableRequest<SrvContactData & { srvId: number }>) => {
    const CF_NAME = 'updateSrvContact';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { srvId, firstName, lastName, email, mobile, dateOfBirth, gender } = request.data;
    if (!srvId || !firstName || !lastName) {
      throw new HttpsError('invalid-argument', 'srvId, firstName and lastName are required');
    }

    logger.info(`${CF_NAME}: updating SRV member ${srvId} "${firstName} ${lastName}"`);

    const payload: Partial<RegasoftMember> = {
      id: srvId,
      firstName,
      lastName,
      email: email ?? null,
      mobile: mobile ?? null,
      birthday: storeDateToRegasoftDate(dateOfBirth),
      gender,
    };

    try {
      await axios.put<RegasoftMember>(
        `${REGASOFT_BASE}/api/club/members/${srvId}`,
        payload,
        { headers: regasoftHeaders(regasoftApiKey.value(), regasoftClubId.value()) }
      );

      logger.info(`${CF_NAME}: updated SRV member ${srvId}`);
      return { id: String(srvId) };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Regasoft API error ${status}: ${body}`);
        throw new HttpsError('internal', `Regasoft API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Regasoft member update failed');
    }
  }
);
