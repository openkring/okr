// apps/functions/src/_gateway/adapters/srv.spec.ts
import { describe, it, expect } from 'vitest';
import {
  unwrapMembers,
  unwrapMember,
  mapSrvContact,
  mapSrvLicensed,
  selectLicensed,
  mapSrvDetail,
  srvMembersAdapter,
  srvMemberDetailAdapter,
  SRV_PROVIDER_IDS,
} from './srv';

const MEMBER = {
  id: 42,
  serviceId: 'SVC-1',
  firstName: 'Hans',
  lastName: 'Muster',
  email: 'hans@example.ch',
  // Regasoft sends ISO datetimes, not a Swiss-formatted date.
  birthday: '1980-02-01T00:00:00',
  hasLicense: true,
  licenseId: 987,
  licenseImage: 'base64…',
  licenseImageName: 'lic.png',
  licenseImageMimeType: 'image/png',
  personClubs: [{ clubName: 'SCS', mainClub: true }],
} as never;

describe('unwrapMembers / unwrapMember', () => {
  // Regasoft answers a bare array on some endpoints and { data: … } on others.
  it('accepts a bare array', () => {
    expect(unwrapMembers([MEMBER])).toHaveLength(1);
  });
  it('accepts a { data: [...] } wrapper', () => {
    expect(unwrapMembers({ data: [MEMBER] })).toHaveLength(1);
  });
  it('returns an empty list for junk rather than throwing', () => {
    expect(unwrapMembers(null)).toEqual([]);
    expect(unwrapMembers({})).toEqual([]);
    expect(unwrapMembers({ data: 'nope' })).toEqual([]);
  });
  it('unwraps a single member either way', () => {
    expect(unwrapMember(MEMBER)?.id).toBe(42);
    expect(unwrapMember({ data: MEMBER })?.id).toBe(42);
  });
  it('returns null for a record with no id', () => {
    expect(unwrapMember({})).toBeNull();
    expect(unwrapMember(null)).toBeNull();
  });
});

describe('projections', () => {
  it('maps the contact shape the client has always received', () => {
    const c = mapSrvContact(MEMBER);
    expect(c.srvId).toBe(42);
    expect(c.firstName).toBe('Hans');
    expect(c.hasLicense).toBe(true);
    expect(c.dateOfBirth).toBe('19800201');
    expect(c.clubs).toEqual([{ clubName: 'SCS', mainClub: true }]);
  });

  it('keeps the licence image OUT of the contact shape', () => {
    // The contact list is fetched far more often than the licensed list; pulling
    // a base64 image into it would bloat every response and the cache entry.
    expect(mapSrvContact(MEMBER)).not.toHaveProperty('licenseImage');
  });

  it('puts the licence image IN the licensed shape', () => {
    const l = mapSrvLicensed(MEMBER);
    expect(l.licenseImage).toBe('base64…');
    expect(l.licenseImageMimeType).toBe('image/png');
  });

  it('selects only members holding a licence', () => {
    const members = [MEMBER, { ...(MEMBER as object), id: 7, hasLicense: false }] as never[];
    expect(selectLicensed(members).map((m) => m.id)).toEqual([42]);
  });

  it('treats a missing hasLicense as not licensed', () => {
    expect(selectLicensed([{ id: 1 } as never])).toEqual([]);
  });

  it('maps a detail record, stringifying licenseId', () => {
    const d = mapSrvDetail(MEMBER);
    expect(d?.rid).toBe(42);
    expect(d?.licenseId).toBe('987');
  });

  it('returns null when the detail payload has no member', () => {
    expect(mapSrvDetail({})).toBeNull();
    expect(mapSrvDetail(undefined)).toBeNull();
  });
});

describe('adapter declarations', () => {
  const all = [srvMembersAdapter, srvMemberDetailAdapter];

  it('is tenant-scoped and authenticated — SRV records are member PII', () => {
    for (const a of all) {
      expect(a.scope).toBe('tenant');
      expect(a.requiresAuth).toBe(true);
    }
  });

  it('shares one TTL so the list and the details cannot disagree in one index build', () => {
    expect(srvMembersAdapter.ttlSeconds).toBe(30 * 60);
    expect(srvMemberDetailAdapter.ttlSeconds).toBe(srvMembersAdapter.ttlSeconds);
  });

  it('sets no monthly cap — Regasoft is a fixed-fee federation API, not per-call billing', () => {
    for (const a of all) expect(a.monthlyCap).toBeUndefined();
  });

  it('lists every provider id a write must invalidate', () => {
    // If an adapter is added without extending this list, its cache would
    // survive a member edit and keep serving the pre-edit record.
    expect([...SRV_PROVIDER_IDS].sort()).toEqual(all.map((a) => a.id).sort());
  });
});
