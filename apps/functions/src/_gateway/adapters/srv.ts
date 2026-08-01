// apps/functions/src/_gateway/adapters/srv.ts
//
// Regasoft SRV adapters. Like location, and unlike oecd/zefix/searchch, these are
// NOT wrapped in `makeGatewayCallable` — the callables in ../../srv/contact.ts
// stay hand-written because they enforce a role gate (`memberAdmin`) that the
// gateway knows nothing about. SRV records are member PII, so that gate is not
// optional and must run before anything else. The callables keep their existing
// response shapes, so no client change is needed.
//
// scope: 'tenant' — member PII must never be served across a tenant boundary,
// regardless of the fact that the Regasoft credentials are currently one club's.
//
// TWO adapters, not three, for three callables:
//
//  - `srv-members` backs BOTH `getSrvContacts` and `getSrvLicensedMembers`.
//    They always hit the same endpoint; "licensed" was only ever a local
//    `hasLicense` filter over the same payload. Sharing one adapter means the
//    second callable costs nothing once the first has run. Its `map` therefore
//    stops at the unwrapped member list and each callable applies its own
//    projection — the two need different fields (the licensed shape carries the
//    licence image, which must NOT be pushed into the much more frequently
//    fetched contact shape).
//
//  - `srv-member-detail` is keyed on ONE rid, not on the caller's rid array. The
//    client enriches every member of the index in a single `getSrvMemberDetail`
//    call, so an array key would produce a distinct entry per index build and
//    never hit; per-rid entries are reused across builds and across differing rid
//    sets. This is where nearly all of the upstream volume is — one call per
//    member per rebuild.
//
// ⚠️ `srv-members` caches the whole member list in one Firestore document, capped
// at 1 MiB. A large enough club will exceed it; the cache write then fails soft
// (logged, request still served), so the failure mode is "no caching", not an
// error. If that appears in the logs, page the list adapter rather than raising
// anything.

import { HttpsError } from 'firebase-functions/v2/https';
import { regasoftDateToStoreDate } from '@okr/shared-util-core';
import { Club, RegasoftMember, SrvMemberLicenseDetail } from '@okr/shared-models';
import type { ProviderAdapter, GatewayContext } from '../provider';
import { gatewayFetch } from '../http';

import { regasoftApiKey, regasoftClubId, REGASOFT_BASE } from '../../srv/shared';

/**
 * 30 minutes, uniform across both adapters.
 *
 * Uniform matters: the client builds its index from the member list AND the
 * per-member details in one pass, so two different TTLs could show it two
 * contradictory versions of the same member. 30 minutes covers a working session
 * (an admin reconciling data rebuilds the index repeatedly) while bounding how
 * long an edit made directly in the SRV portal stays invisible. Edits made
 * through OUR callables do not wait for it — they invalidate (see
 * invalidateSrvCaches in ../../srv/contact.ts).
 */
const SRV_TTL = 30 * 60;

const ATTRIBUTION = {
  provider: 'Regasoft SRV',
  url: 'https://www.swissrowing.ch/',
  licence: 'Swiss Rowing / Regasoft',
};

/** Every provider id below, so a write can invalidate all of them at once. */
export const SRV_PROVIDER_IDS = ['srv-members', 'srv-member-detail'] as const;

export const SRV_SECRETS = [regasoftApiKey, regasoftClubId];

function regasoftHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ApiKey: regasoftApiKey.value(),
    ClubId: regasoftClubId.value(),
  };
}

/** Regasoft answers either a bare array or `{ data: [...] }`. */
export function unwrapMembers(raw: unknown): RegasoftMember[] {
  if (Array.isArray(raw)) return raw as RegasoftMember[];
  const wrapped = (raw as { data?: unknown })?.data;
  return Array.isArray(wrapped) ? (wrapped as RegasoftMember[]) : [];
}

/** …and either a bare member or `{ data: {...} }` for a single record. */
export function unwrapMember(raw: unknown): RegasoftMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const inner = (raw as { data?: unknown }).data;
  const m = (inner && typeof inner === 'object' ? inner : raw) as RegasoftMember;
  return m && m.id != null ? m : null;
}

// --- projections: kept verbatim from the pre-gateway callables so the retrofit
//     is invisible to the client. Pure, so they are unit-testable on their own.

export function mapSrvContact(m: RegasoftMember) {
  return {
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
    clubs: (m.personClubs ?? []) as Club[],
  };
}

export function mapSrvLicensed(m: RegasoftMember) {
  return {
    srvId: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    licenseDate: regasoftDateToStoreDate(m.licenseDate ?? null),
    licenseValidUntil: regasoftDateToStoreDate(m.licenseValidUntil ?? null),
    licenseImage: m.licenseImage ?? null,
    licenseImageName: m.licenseImageName ?? null,
    licenseImageMimeType: m.licenseImageMimeType ?? null,
  };
}

/** The `hasLicense === true` filter `getSrvLicensedMembers` has always applied. */
export function selectLicensed(members: RegasoftMember[]): RegasoftMember[] {
  return members.filter((m) => m.hasLicense === true);
}

export function mapSrvDetail(raw: unknown): SrvMemberLicenseDetail | null {
  const m = unwrapMember(raw);
  if (!m) return null;
  return {
    rid: m.id,
    hasNewsletter: m.hasNewsletter ?? false,
    street: m.street ?? '',
    postcode: m.postcode ?? '',
    city: m.city ?? '',
    licenseId: m.licenseId != null ? String(m.licenseId) : '',
    licenseDate: regasoftDateToStoreDate(m.licenseDate),
    licenseValidUntil: regasoftDateToStoreDate(m.licenseValidUntil),
    licenseImage: m.licenseImage ?? null,
    licenseImageName: m.licenseImageName ?? null,
    licenseImageMimeType: m.licenseImageMimeType ?? null,
    inactiveDate: regasoftDateToStoreDate(m.inactiveDate),
    dateOfDeath: regasoftDateToStoreDate(m.dateOfDeath),
    leavingDate: regasoftDateToStoreDate(m.leavingDate),
    clubs: m.personClubs ?? [],
  };
}

/**
 * All members of the club. `map` deliberately stops at the unwrapped list rather
 * than projecting: two callables consume this payload and need different fields
 * (see the header). Both projections are pure functions above, applied by the
 * caller.
 */
export const srvMembersAdapter: ProviderAdapter<Record<string, never>, unknown, RegasoftMember[]> = {
  id: 'srv-members',
  baseUrl: REGASOFT_BASE,
  secrets: SRV_SECRETS,
  scope: 'tenant',
  ttlSeconds: SRV_TTL,
  requiresAuth: true,
  attribution: ATTRIBUTION,
  async fetch(_params, _ctx: GatewayContext) {
    const res = await gatewayFetch(`${REGASOFT_BASE}/api/club/members`, {
      method: 'GET',
      headers: regasoftHeaders(),
    });
    return res.data;
  },
  map: unwrapMembers,
  sourceTimestamp: () => null,
};

/** ONE member's detail record — see the per-rid note in the file header. */
export const srvMemberDetailAdapter: ProviderAdapter<{ rid: number }, unknown, SrvMemberLicenseDetail | null> = {
  id: 'srv-member-detail',
  baseUrl: REGASOFT_BASE,
  secrets: SRV_SECRETS,
  scope: 'tenant',
  ttlSeconds: SRV_TTL,
  requiresAuth: true,
  attribution: ATTRIBUTION,
  async fetch(params, _ctx: GatewayContext) {
    if (!Number.isFinite(params.rid) || params.rid <= 0) {
      throw new HttpsError('invalid-argument', 'rid must be a positive number');
    }
    const res = await gatewayFetch(
      `${REGASOFT_BASE}/api/club/members/${encodeURIComponent(String(params.rid))}`,
      { method: 'GET', headers: regasoftHeaders() },
    );
    return res.data;
  },
  map: mapSrvDetail,
  sourceTimestamp: () => null,
};
