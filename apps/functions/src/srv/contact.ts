import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { checkRoles } from '@okr/shared-util-functions';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import { RegasoftMember, SrvChanges, SrvContactData, SrvCountry, SrvMemberAll, SrvMemberLicenseDetail, SrvMembersAllResult, SrvPreview, SrvUpdateResult } from '@okr/shared-models';

import { runGateway, resolveTenantId } from '../_gateway/gateway';
import { invalidateProvider } from '../_gateway/cache';
import type { GatewayContext } from '../_gateway/provider';
import { gatewayFetch } from '../_gateway/http';
import {
  SRV_SECRETS,
  SRV_PROVIDER_IDS,
  srvMembersAdapter,
  srvMembersAllAdapter,
  srvMemberDetailAdapter,
  srvCountriesAdapter,
  mapSrvContact,
  mapSrvMemberAll,
  regasoftHeaders as gatewayRegasoftHeaders,
  unwrapMembers,
  unwrapRawMember,
} from '../_gateway/adapters/srv';

import { isRegasoftTestSystem, regasoftApiKey, regasoftBaseUrl, regasoftClubId } from './shared';
import { buildSrvCreatePayload, runSrvPreview, runSrvUpdate } from './srv-update';

/**
 * Writes to Regasoft stay switched off until they have been tested against PortalTest (plan
 * 1.133, Task 9). Regasoft's PUT replaces the whole record and a record can never be deleted:
 * the old payloads sent only part of it, so every update erased salutation, streetAdditional,
 * countryId, telefon, entryDate and inactiveDate (probe 2026-11-02,
 * planning/reference/REGASOFT.md). The read-modify-write in ./srv-update.ts fixes that, but it
 * is turned on only after the test. Blocking here, not only in the client, also stops app
 * versions that still offer the actions. The preview (`previewSrvUpdate`) sends nothing and is
 * never blocked.
 */
const SRV_UPDATE_ENABLED = false;
/** Create stays off longer: a new Regasoft record can never be deleted again, and POST is unprobed (Q7). */
const SRV_CREATE_ENABLED = false;

function assertEnabled(enabled: boolean, cfName: string): void {
  if (enabled) return;
  logger.warn(`${cfName}: rejected, Regasoft writes are disabled (spec 1.133)`);
  throw new HttpsError('failed-precondition', 'Regasoft writes are disabled until the safe update (spec 1.133) is tested');
}

function regasoftHeaders(apiKey: string, clubId: string) {
  return {
    'Content-Type': 'application/json',
    'ApiKey': apiKey,
    'ClubId': clubId,
  };
}

/**
 * A Regasoft failure as the client sees it. An `HttpsError` (our own checks) passes through;
 * a Regasoft HTTP error keeps its status and body.
 */
function toRegasoftError(cfName: string, error: unknown, fallback: string): HttpsError {
  if (error instanceof HttpsError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = JSON.stringify(error.response?.data);
    logger.error(`${cfName}: Regasoft API error ${status}: ${body}`);
    return new HttpsError('internal', `Regasoft API error ${status}: ${body}`);
  }
  logger.error(`${cfName}: unexpected error`, error);
  return new HttpsError('internal', fallback);
}

/**
 * One member's record exactly as Regasoft returns it (every key), read live — never through the
 * gateway cache, because a write must be merged into the current record (spec 1.133 D1).
 */
async function readRawSrvMember(rid: number, ctx: GatewayContext): Promise<Record<string, unknown> | null> {
  return unwrapRawMember(await srvMemberDetailAdapter.fetch({ rid }, ctx));
}

/** The `modified` read only informs the preview: no retry, a short timeout, so a slow Regasoft never holds it up. */
const SRV_MODIFIED_TIMEOUT_MS = 5_000;

/**
 * When Regasoft last changed a member (C5): the `modified` field exists only in the member list, so
 * the current list is read live, then the list of members who left. null when neither has the rid.
 */
async function readSrvModified(rid: number): Promise<string | null> {
  for (const query of ['', '?inactive=true']) {
    const res = await gatewayFetch(`${regasoftBaseUrl()}/api/club/members${query}`, {
      method: 'GET', headers: gatewayRegasoftHeaders(), maxRetries: 0, timeoutMs: SRV_MODIFIED_TIMEOUT_MS,
    });
    const m = unwrapMembers(res.data).find((x) => x.id === rid);
    if (m) return typeof m.modified === 'string' ? m.modified : null;
  }
  return null;
}

/** A `PUT` that has not answered by then is given up; whether it was applied is then unknown. */
const SRV_PUT_TIMEOUT_MS = 20_000;

/**
 * `PUT` the complete record. Plain axios, no retry: the outcome is checked by reading back. A PUT
 * without any answer (timeout, connection lost) may still have been applied, so it is reported as
 * not confirmed rather than as failed.
 */
async function putSrvMember(rid: number, payload: Record<string, unknown>): Promise<void> {
  try {
    await axios.put(
      `${regasoftBaseUrl()}/api/club/members/${rid}`,
      payload,
      { headers: regasoftHeaders(regasoftApiKey.value(), regasoftClubId.value()), timeout: SRV_PUT_TIMEOUT_MS }
    );
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && !error.response) {
      logger.error(`updateSrvContact: PUT of member ${rid} got no answer: ${error.code ?? error.message}`);
      throw new HttpsError('unknown', `Member ${rid} was sent to Regasoft but not confirmed: no answer (${error.code ?? error.message})`);
    }
    throw error;
  }
}

/** `{ srvId, changes }` from the client, validated before anything is read. */
function parseSrvWrite(data: unknown): { rid: number; changes: SrvChanges } {
  const { srvId, changes } = (data ?? {}) as { srvId?: unknown; changes?: unknown };
  const rid = Number(srvId);
  if (srvId === null || srvId === undefined || srvId === '' || !Number.isInteger(rid) || rid <= 0) {
    throw new HttpsError('invalid-argument', 'srvId must be a positive integer');
  }
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new HttpsError('invalid-argument', 'changes must be an object');
  }
  return { rid, changes: changes as SrvChanges };
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
export async function handleGetSrvContacts(request: CallableRequest) {
  const CF_NAME = 'getSrvContacts';

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
  await checkRoles(request, CF_NAME, ['memberAdmin']);

  const ctx = await srvContext(request);
  const res = await runGateway(srvMembersAdapter, {}, ctx);
  logger.info(`${CF_NAME}: ${res.data.length} members`, { cached: res.cached });
  const testSystem = isRegasoftTestSystem();
  return res.data.map((m) => mapSrvContact(m, testSystem));
}

export const getSrvContacts = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: SRV_SECRETS,
  },
  handleGetSrvContacts
);

/**
 * Fetch member detail from GET /api/club/members/{id} for a list of rids.
 * Returns license dates taken from the individual detail records.
 */
export async function handleGetSrvMemberDetail(request: CallableRequest<{ rids: number[] }>) {
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

export const getSrvMemberDetail = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [regasoftApiKey, regasoftClubId],
  },
  handleGetSrvMemberDetail
);

/**
 * Current members and members who left, both in the detail shape, plus Regasoft's country list
 * (spec 1.133 C1, C3). Router op only (`srv` / `getSrvMembersAll`), so it adds no deployed
 * function. Both member lists are required — without the members who left, a re-joining member
 * could not be matched — so either failing fails the call. The country list is optional: empty
 * when it cannot be read, and the client falls back to CH = 3. A record in both lists (should
 * never happen) is kept once, as current, and logged.
 */
export async function handleGetSrvMembersAll(request: CallableRequest): Promise<SrvMembersAllResult> {
  const CF_NAME = 'getSrvMembersAll';

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
  await checkRoles(request, CF_NAME, ['memberAdmin']);

  const ctx = await srvContext(request);
  const [active, inactive, countries] = await Promise.all([
    runGateway(srvMembersAllAdapter, { inactive: false }, ctx),
    runGateway(srvMembersAllAdapter, { inactive: true }, ctx),
    runGateway(srvCountriesAdapter, {}, ctx).then(
      (r): SrvCountry[] => r.data,
      (e: unknown): SrvCountry[] => {
        logger.warn(`${CF_NAME}: country list unavailable`, { message: e instanceof Error ? e.message : String(e) });
        return [];
      },
    ),
  ]);

  const ownClubId = Number(regasoftClubId.value());
  const testSystem = isRegasoftTestSystem();
  const members: SrvMemberAll[] = [];
  const seen = new Set<number>();
  let dropped = 0;
  let duplicates = 0;
  for (const [list, isActive] of [[active.data, true], [inactive.data, false]] as const) {
    for (const raw of list) {
      const m = mapSrvMemberAll(raw, ownClubId, isActive, testSystem);
      if (!m) { dropped++; continue; }
      if (seen.has(m.contact.srvId)) {
        duplicates++;
        continue;
      }
      seen.add(m.contact.srvId);
      members.push(m);
    }
  }
  logger.info(`${CF_NAME}: ${active.data.length} current, ${inactive.data.length} left, ${countries.length} countries`, {
    cached: { active: active.cached, inactive: inactive.cached }, dropped,
  });
  if (duplicates > 0) logger.warn(`${CF_NAME}: ${duplicates} members are current and inactive at once, kept as current`);
  return { members, countries };
}

/**
 * Create a new member in the Regasoft SRV API.
 * Returns the newly assigned SRV member ID.
 */
export async function handleCreateSrvContact(request: CallableRequest<SrvContactData>) {
  const CF_NAME = 'createSrvContact';

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
  await checkRoles(request, CF_NAME, ['memberAdmin']);
  assertEnabled(SRV_CREATE_ENABLED, CF_NAME);

  const { firstName, lastName } = request.data;
  if (!firstName || !lastName) {
    throw new HttpsError('invalid-argument', 'firstName and lastName are required');
  }

  logger.info(`${CF_NAME}: creating SRV member`);
  const payload = buildSrvCreatePayload(request.data, isRegasoftTestSystem());

  try {
    const response = await axios.post<RegasoftMember>(
      `${regasoftBaseUrl()}/api/club/members`,
      payload,
      { headers: regasoftHeaders(regasoftApiKey.value(), regasoftClubId.value()) }
    );

    logger.info(`${CF_NAME}: created SRV member with id ${response.data.id}`);
    await invalidateSrvCaches(await srvContext(request));
    return { id: String(response.data.id) };
  } catch (error: unknown) {
    throw toRegasoftError(CF_NAME, error, 'Regasoft member creation failed');
  }
}

export const createSrvContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [regasoftApiKey, regasoftClubId],
  },
  handleCreateSrvContact
);

/**
 * Update an existing member in the Regasoft SRV API (spec 1.133 §4.1): read the record live,
 * lay `changes` over it, `PUT` the complete record, read it back. Returns the record before and
 * after and which changed fields Regasoft took (`written`) or silently ignored (`ignored`).
 */
export async function handleUpdateSrvContact(
  request: CallableRequest<{ srvId: number; changes: SrvChanges }>
): Promise<SrvUpdateResult> {
  const CF_NAME = 'updateSrvContact';

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
  await checkRoles(request, CF_NAME, ['memberAdmin']);
  assertEnabled(SRV_UPDATE_ENABLED, CF_NAME);

  const { rid, changes } = parseSrvWrite(request.data);
  const ctx = await srvContext(request);
  logger.info(`${CF_NAME}: updating SRV member ${rid}`, { fields: Object.keys(changes) });

  try {
    const result = await runSrvUpdate({
      rid,
      changes,
      testSystem: isRegasoftTestSystem(),
      read: (id) => readRawSrvMember(id, ctx),
      write: putSrvMember,
      onWritten: () => invalidateSrvCaches(ctx),
    });
    logger.info(`${CF_NAME}: updated SRV member ${rid}`, { written: result.written, ignored: result.ignored });
    return result;
  } catch (error: unknown) {
    throw toRegasoftError(CF_NAME, error, 'Regasoft member update failed');
  }
}

export const updateSrvContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [regasoftApiKey, regasoftClubId],
  },
  handleUpdateSrvContact
);

/**
 * Dry run of `updateSrvContact` (spec 1.133 D12): the same live read and merge, no `PUT`.
 * Never blocked by the write switches. Router op only (`srv` / `previewSrvUpdate`).
 */
export async function handlePreviewSrvUpdate(
  request: CallableRequest<{ srvId: number; changes: SrvChanges }>
): Promise<SrvPreview> {
  const CF_NAME = 'previewSrvUpdate';

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  // SRV member data is person PII — memberAdmin/admin only (privacy inventory §7.2).
  await checkRoles(request, CF_NAME, ['memberAdmin']);

  const { rid, changes } = parseSrvWrite(request.data);
  const ctx = await srvContext(request);

  try {
    return await runSrvPreview({
      rid,
      changes,
      testSystem: isRegasoftTestSystem(),
      read: (id) => readRawSrvMember(id, ctx),
      readModified: readSrvModified,
    });
  } catch (error: unknown) {
    throw toRegasoftError(CF_NAME, error, 'Regasoft member preview failed');
  }
}
