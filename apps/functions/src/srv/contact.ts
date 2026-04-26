import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

import { regasoftApiKey, regasoftClubId, REGASOFT_BASE, RegasoftMember, PersonClub } from './shared';

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
  fullname?: string;
  email: string | null;
  mobile: string | null;
  dateOfBirth: string;       // StoreDate YYYYMMDD
  gender: number;            // 1=male, 2=female
  membershipType?: string;   // 'Active' | 'Passive'
  nationIOC?: string;
  language?: number;
  hasNewsletter?: boolean;
  hasLicense?: boolean;
  street?: string | null;
  streetAdditional?: string | null;
  postcode?: string | null;
  city?: string | null;
  countryName?: string | null;
  countryId?: string | null;
  telefon?: string | null;
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
      const response = await axios.get<RegasoftMember[] | { data: RegasoftMember[] }>(`${REGASOFT_BASE}/api/club/members`, {
        headers: regasoftHeaders(regasoftApiKey.value(), regasoftClubId.value()),
      });

      const raw = response.data;
      const members: RegasoftMember[] = Array.isArray(raw) ? raw : (raw as { data: RegasoftMember[] }).data ?? [];
      logger.info(`${CF_NAME}: fetched ${members.length} members`);

      return members.map(m => ({
        srvId: m.id,
        serviceId: m.serviceId,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email ?? null,
        mobile: m.mobile ?? null,
        telefon: m.telefon ?? null,
        dateOfBirth: regasoftDateToStoreDate(m.birthday),
        gender: m.gender,
        membershipType: m.membershipType ?? null,
        nationIOC: m.nationIOC ?? null,
        hasNewsletter: m.hasNewsletter ?? false,
        mainClub: m.mainClub ?? false,
        hasLicense: m.hasLicense ?? false,
        licenseId: m.licenseId ?? null,
        licenseDate: regasoftDateToStoreDate(m.licenseDate),
        licenseValidUntil: regasoftDateToStoreDate(m.licenseValidUntil),
        leavingDate: regasoftDateToStoreDate(m.leavingDate),
        dateOfDeath: regasoftDateToStoreDate(m.dateOfDeath),
        street: m.street ?? null,
        postcode: m.postcode ?? null,
        city: m.city ?? null,
        personClubs: (m.personClubs ?? []) as PersonClub[],
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
 * Fetch all members with an active license from the Regasoft SRV API.
 */
export const getSrvLicensedMembers = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [regasoftApiKey, regasoftClubId],
  },
  async (request: CallableRequest) => {
    const CF_NAME = 'getSrvLicensedMembers';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    logger.info(`${CF_NAME}: fetching licensed SRV members`);

    try {
      const response = await axios.get<RegasoftMember[] | { data: RegasoftMember[] }>(`${REGASOFT_BASE}/api/club/members`, {
        headers: regasoftHeaders(regasoftApiKey.value(), regasoftClubId.value()),
      });

      const raw = response.data;
      const members: RegasoftMember[] = Array.isArray(raw) ? raw : (raw as { data: RegasoftMember[] }).data ?? [];
      const licensed = members.filter(m => m.hasLicense === true);
      logger.info(`${CF_NAME}: ${licensed.length} licensed members found`);

      return licensed.map(m => ({
        srvId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        licenseDate: regasoftDateToStoreDate(m.licenseDate ?? null),
        licenseValidUntil: regasoftDateToStoreDate(m.licenseValidUntil ?? null),
        licenseImage: m.licenseImage ?? null,
        licenseImageName: m.licenseImageName ?? null,
        licenseImageMimeType: m.licenseImageMimeType ?? null,
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

export interface SrvMemberLicenseDetail {
  rid: number;
  licenseDate: string;            // StoreDate YYYYMMDD
  licenseValidUntil: string;      // StoreDate YYYYMMDD
  licenseImage: string | null;
  licenseImageName: string | null;
  licenseImageMimeType: string | null;
}

/**
 * Fetch member detail from GET /api/club/members/{id} for a list of rids.
 * Returns license dates taken from the individual detail records.
 */
export const getSrvMemberDetail = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [regasoftApiKey, regasoftClubId],
  },
  async (request: CallableRequest<{ rids: number[] }>) => {
    const CF_NAME = 'getSrvMemberDetail';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { rids } = request.data;
    if (!Array.isArray(rids) || rids.length === 0) {
      throw new HttpsError('invalid-argument', 'rids must be a non-empty array');
    }

    logger.info(`${CF_NAME}: fetching details for ${rids.length} members`);

    const headers = regasoftHeaders(regasoftApiKey.value(), regasoftClubId.value());
    const results = await Promise.allSettled(
      rids.map(rid =>
        axios.get<RegasoftMember>(`${REGASOFT_BASE}/api/club/members/${rid}`, { headers })
      )
    );

    const details: SrvMemberLicenseDetail[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        const m = r.value.data;
        details.push({
          rid: m.id,
          licenseDate:          regasoftDateToStoreDate(m.licenseDate),
          licenseValidUntil:    regasoftDateToStoreDate(m.licenseValidUntil),
          licenseImage:         m.licenseImage ?? null,
          licenseImageName:     m.licenseImageName ?? null,
          licenseImageMimeType: m.licenseImageMimeType ?? null,
        });
      } else {
        logger.warn(`${CF_NAME}: failed to fetch rid ${rids[i]}`, r.reason);
      }
    }

    logger.info(`${CF_NAME}: resolved ${details.length} of ${rids.length} members`);
    return details;
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

    const { fullname, membershipType, nationIOC, language, hasNewsletter, hasLicense,
            street, streetAdditional, postcode, city, countryName, countryId, telefon } = request.data;
    const payload: Partial<RegasoftMember> = {
      id: 0,
      firstName,
      lastName,
      fullname,
      email: email ?? null,
      mobile: mobile ?? null,
      birthday: storeDateToRegasoftDate(dateOfBirth),
      gender,
      membershipType,
      nationIOC,
      language,
      hasNewsletter,
      hasLicense,
      street: street ?? null,
      streetAdditional: streetAdditional ?? null,
      postcode: postcode ?? null,
      city: city ?? null,
      countryName: countryName ?? null,
      countryId: countryId ? Number(countryId) || null : null,
      telefon: telefon ?? null,
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
