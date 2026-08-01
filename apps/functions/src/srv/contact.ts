import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { checkRoles } from '@okr/shared-util-functions';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import { storeDateToRegasoftDate } from '@okr/shared-util-core';
import { RegasoftMember, SrvContactData, SrvMemberLicenseDetail } from '@okr/shared-models';

import { runGateway, resolveTenantId } from '../_gateway/gateway';
import { invalidateProvider } from '../_gateway/cache';
import type { GatewayContext } from '../_gateway/provider';
import {
  SRV_SECRETS,
  SRV_PROVIDER_IDS,
  srvMembersAdapter,
  srvMemberDetailAdapter,
  mapSrvContact,
  mapSrvLicensed,
  selectLicensed,
} from '../_gateway/adapters/srv';

import { regasoftApiKey, regasoftClubId, REGASOFT_BASE } from './shared';

function regasoftHeaders(apiKey: string, clubId: string) {
  return {
    'Content-Type': 'application/json',
    'ApiKey': apiKey,
    'ClubId': clubId,
  };
}

/**
 * The caller's gateway context. SRV adapters are `tenant`-scoped, so the tenant
 * has to be resolved server-side; `checkRoles` has already established that the
 * caller is a memberAdmin of it.
 */
async function srvContext(request: CallableRequest<unknown>): Promise<GatewayContext> {
  const uid = request.auth?.uid ?? null;
  const token = request.auth?.token as Record<string, unknown> | undefined;
  return {
    tenantId: await resolveTenantId(uid, 'tenant'),
    uid,
    isAdmin: token?.['admin'] === true,
  };
}

/**
 * Drop this tenant's cached SRV reads after we ourselves changed a member.
 * Without it the read-through cache would keep serving the pre-edit member for
 * up to the TTL — the admin's own change would appear not to have happened,
 * which is the single most confusing failure a cache can produce.
 *
 * Fail-soft by construction (see invalidateProvider): the Regasoft write has
 * already succeeded by this point, so a failure here is logged loudly, not
 * raised.
 */
async function invalidateSrvCaches(ctx: GatewayContext): Promise<void> {
  for (const providerId of SRV_PROVIDER_IDS) {
    await invalidateProvider(providerId, 'tenant', ctx);
  }
}

/**
 * Fetch all members from the Regasoft SRV API.
 * Gateway-backed (cache + quota + retry); response shape unchanged.
 */
export const getSrvContacts = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: SRV_SECRETS,
  },
  async (request: CallableRequest) => {
    const CF_NAME = 'getSrvContacts';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
    await checkRoles(request, CF_NAME, ['memberAdmin']);

    const ctx = await srvContext(request);
    const res = await runGateway(srvMembersAdapter, {}, ctx);
    logger.info(`${CF_NAME}: ${res.data.length} members`, { cached: res.cached });
    return res.data.map(mapSrvContact);
  }
);

/**
 * Fetch all members with an active license from the Regasoft SRV API.
 *
 * Shares the `srv-members` cache entry with getSrvContacts — same endpoint, and
 * "licensed" is a local filter — so after an index build this costs no upstream
 * call at all.
 */
export const getSrvLicensedMembers = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: SRV_SECRETS,
  },
  async (request: CallableRequest) => {
    const CF_NAME = 'getSrvLicensedMembers';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
    await checkRoles(request, CF_NAME, ['memberAdmin']);

    const ctx = await srvContext(request);
    const res = await runGateway(srvMembersAdapter, {}, ctx);
    const licensed = selectLicensed(res.data);
    logger.info(`${CF_NAME}: ${licensed.length} licensed members`, { cached: res.cached });
    return licensed.map(mapSrvLicensed);
  }
);

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
    // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
    await checkRoles(request, CF_NAME, ['memberAdmin']);

    const { rids } = request.data;
    if (!Array.isArray(rids) || rids.length === 0) {
      throw new HttpsError('invalid-argument', 'rids must be a non-empty array');
    }

    logger.info(`${CF_NAME}: fetching details for ${rids.length} members`);

    // One gateway call PER rid, so each member's detail is cached individually
    // and reused by the next index build (and by any other rid set that includes
    // them). Keeping allSettled preserves the existing contract: a member whose
    // record cannot be fetched is skipped, not fatal to the whole enrichment.
    const ctx = await srvContext(request);
    const unique = [...new Set(rids)];
    const results = await Promise.allSettled(
      unique.map(rid => runGateway(srvMemberDetailAdapter, { rid }, ctx))
    );

    const details: SrvMemberLicenseDetail[] = [];
    let cachedCount = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        if (r.value.cached) cachedCount++;
        if (r.value.data) details.push(r.value.data);
      } else {
        logger.warn(`${CF_NAME}: failed to fetch rid ${unique[i]}`, {
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }

    logger.info(
      `${CF_NAME}: resolved ${details.length} of ${unique.length} members (${cachedCount} from cache)`
    );
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
    // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
    await checkRoles(request, CF_NAME, ['memberAdmin']);

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
      await invalidateSrvCaches(await srvContext(request));
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
    // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
    await checkRoles(request, CF_NAME, ['memberAdmin']);

    const { srvId, firstName, lastName, email, mobile, dateOfBirth, gender,
            membershipType, street, postcode, city, dateOfDeath, leavingDate } = request.data;
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
      membershipType,
      street: street ?? null,
      postcode: postcode ?? null,
      city: city ?? null,
      dateOfDeath: storeDateToRegasoftDate(dateOfDeath ?? undefined),
      leavingDate: storeDateToRegasoftDate(leavingDate ?? undefined),
    };

    try {
      await axios.put<RegasoftMember>(
        `${REGASOFT_BASE}/api/club/members/${srvId}`,
        payload,
        { headers: regasoftHeaders(regasoftApiKey.value(), regasoftClubId.value()) }
      );

      logger.info(`${CF_NAME}: updated SRV member ${srvId}`);
      await invalidateSrvCaches(await srvContext(request));
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
