// apps/functions/src/_gateway/adapters/srv.spec.ts
import { describe, it, expect } from 'vitest';
import {
  unwrapMembers,
  unwrapMember,
  unwrapRawMember,
  mapSrvContact,
  mapSrvLicensed,
  selectLicensed,
  mapSrvDetail,
  mapSrvMemberAll,
  mapSrvCountries,
  srvMembersAdapter,
  srvMembersAllAdapter,
  srvMemberDetailAdapter,
  srvCountriesAdapter,
  SRV_ALL_FIELDS,
  SRV_DETAIL_FIELDS,
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
  it('unwraps the raw record with every key, including ones our model does not know', () => {
    const raw = { id: 7, entryDate: '2013-03-12T00:00:00', futureField: 42 };
    expect(unwrapRawMember({ data: raw })).toBe(raw);
    expect(unwrapRawMember(raw)).toBe(raw);
    expect(unwrapRawMember({ data: null })).toBeNull();
    expect(unwrapRawMember('nope')).toBeNull();
  });
});

describe('test-system emails', () => {
  const TEST_MEMBER = { ...(MEMBER as object), email: 'hans@example.chx' } as never;

  it('strips the trailing x when reading the test system', () => {
    expect(mapSrvContact(TEST_MEMBER, true).email).toBe('hans@example.ch');
    expect(mapSrvDetail(TEST_MEMBER, true)?.email).toBe('hans@example.ch');
  });

  it('keeps the email as it is in production', () => {
    expect(mapSrvContact(TEST_MEMBER, false).email).toBe('hans@example.chx');
    expect(mapSrvDetail(TEST_MEMBER, false)?.email).toBe('hans@example.chx');
  });
});

describe('projections', () => {
  it('maps the contact shape the client has always received', () => {
    const c = mapSrvContact(MEMBER, false);
    expect(c.srvId).toBe(42);
    expect(c.firstName).toBe('Hans');
    expect(c.hasLicense).toBe(true);
    expect(c.dateOfBirth).toBe('19800201');
    expect(c.clubs).toEqual([{ clubName: 'SCS', mainClub: true }]);
  });

  it('keeps the licence image OUT of the contact shape', () => {
    // The contact list is fetched far more often than the licensed list; pulling
    // a base64 image into it would bloat every response and the cache entry.
    expect(mapSrvContact(MEMBER, false)).not.toHaveProperty('licenseImage');
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
    const d = mapSrvDetail(MEMBER, false);
    expect(d?.rid).toBe(42);
    expect(d?.licenseId).toBe('987');
  });

  it('fills the detail fields the comparison needs', () => {
    const d = mapSrvDetail({
      ...(MEMBER as object), gender: 2, salutation: 'Frau', streetAdditional: 'c/o X', countryId: 3,
      telefon: '044 111 22 33', mobile: '079 123 45 67', entryDate: '2013-03-12T00:00:00',
    }, false);
    expect(d).toMatchObject({
      gender: 2, salutation: 'Frau', streetAdditional: 'c/o X', countryId: 3,
      telefon: '044 111 22 33', mobile: '079 123 45 67', email: 'hans@example.ch', entryDate: '20130312',
    });
  });

  it('returns null when the detail payload has no member', () => {
    expect(mapSrvDetail({}, false)).toBeNull();
    expect(mapSrvDetail(undefined, false)).toBeNull();
  });
});

/** One record as `GET /api/club/members/all` sends it (field names probed 2026-11-02; values invented). */
const ALL_RECORD = {
  id: 26183, serviceId: 51000, salutation: 'Herr', firstName: 'Hans', lastName: 'Muster',
  birthday: '1980-02-01T00:00:00', gender: 1, nationIOC: 'SUI', language: 1, membershipType: 'Honorary',
  hasNewsletter: true, hasLicense: false, licenseId: null, licenseValidUntil: null,
  licenseImage: null, licenseImageName: null, licenseImageMimeType: null,
  street: 'Seestrasse 1', postcode: '8712', city: 'Stäfa', streetAdditional: null, countryName: 'GB', countryId: 8,
  telefon: '044 111 22 33', mobile: '079 111 22 33', email: 'hans@example.chx', entryDate: '2001-01-01T00:00:00',
  inactive: false, inactiveDate: '2020-01-01T00:00:00', dateOfDeath: null, leavingDate: null,
  fullname: 'Hans Muster', modified: '2026-11-03T08:15:00.123',
  // /all sent personId 0 until 2026-11-02 and the record id since 2026-11-03; the mapping reads neither.
  personClubs: [
    { personId: 26183, personFullname: 'Hans Muster', clubName: 'RC Andere', clubId: 99, mainClub: true },
    { personId: 0, personFullname: 'Hans Muster', clubName: 'Seeclub Stäfa', clubId: 26, mainClub: false },
  ],
};

describe('mapSrvMemberAll (C1)', () => {
  it('maps one /all record into the list contact and the detail', () => {
    const m = mapSrvMemberAll({ ...ALL_RECORD }, 26, true, false);
    expect(m?.active).toBe(true);
    expect(m?.contact).toMatchObject({ srvId: 26183, serviceId: 51000, membershipType: 'Honorary', dateOfBirth: '19800201', telefon: '044 111 22 33' });
    expect(m?.detail).toMatchObject({ rid: 26183, countryId: 8, entryDate: '20010101', inactiveDate: '20200101', leavingDate: '', telefon: '044 111 22 33' });
  });

  it('mainClub is the flag of our own club in personClubs, false when our club is missing', () => {
    expect(mapSrvMemberAll(ALL_RECORD, 26, true, false)?.contact.mainClub).toBe(false);
    expect(mapSrvMemberAll(ALL_RECORD, 99, true, false)?.contact.mainClub).toBe(true);
    expect(mapSrvMemberAll(ALL_RECORD, 1, true, false)?.contact.mainClub).toBe(false);
  });

  it('drops the wrong personId 0 from personClubs, keeps the other fields', () => {
    const m = mapSrvMemberAll(ALL_RECORD, 26, true, false);
    for (const c of [...(m?.contact.clubs ?? []), ...(m?.detail.clubs ?? [])]) expect(c).not.toHaveProperty('personId');
    expect(m?.detail.clubs).toEqual([
      { personFullname: 'Hans Muster', clubName: 'RC Andere', clubId: 99, mainClub: true },
      { personFullname: 'Hans Muster', clubName: 'Seeclub Stäfa', clubId: 26, mainClub: false },
    ]);
  });

  it('a member from ?inactive=true is marked inactive', () => {
    const m = mapSrvMemberAll({ ...ALL_RECORD, inactive: true, leavingDate: '2025-12-31T00:00:00' }, 26, false, false);
    expect(m?.active).toBe(false);
    expect(m?.detail.leavingDate).toBe('20251231');
    expect(m?.contact.leavingDate).toBe('20251231');
  });

  it('test system: both projections strip the x from the email', () => {
    const m = mapSrvMemberAll(ALL_RECORD, 26, true, true);
    expect(m?.contact.email).toBe('hans@example.ch');
    expect(m?.detail.email).toBe('hans@example.ch');
  });

  it('does not change the record it was given', () => {
    const raw = JSON.parse(JSON.stringify(ALL_RECORD));
    mapSrvMemberAll(raw, 26, true, false);
    expect(raw).toEqual(ALL_RECORD);
  });

  it('null for a record without a numeric id', () => {
    expect(mapSrvMemberAll({ ...ALL_RECORD, id: undefined }, 26, true, false)).toBeNull();
    expect(mapSrvMemberAll({ ...ALL_RECORD, id: '26183' }, 26, true, false)).toBeNull();
    expect(mapSrvMemberAll(null, 26, true, false)).toBeNull();
  });

  it('a record without personClubs maps with no clubs and mainClub false', () => {
    const m = mapSrvMemberAll({ ...ALL_RECORD, personClubs: undefined }, 26, true, false);
    expect(m?.contact.clubs).toEqual([]);
    expect(m?.contact.mainClub).toBe(false);
  });

  it('/all is checked against the detail field list', () => {
    expect(SRV_ALL_FIELDS).toEqual(SRV_DETAIL_FIELDS);
    expect(Object.keys(ALL_RECORD).sort()).toEqual([...SRV_ALL_FIELDS].sort());
  });
});

describe('mapSrvCountries (C3)', () => {
  it('reads the envelope or a bare array', () => {
    const list = [{ id: 3, countryCode: 'CH', ioc: 'SUI' }, { id: 8, countryCode: 'GB', ioc: 'GBR' }];
    expect(mapSrvCountries({ data: list, success: true, message: '' })).toEqual(list);
    expect(mapSrvCountries(list)).toEqual(list);
  });

  it('drops entries without a numeric id or a country code; a missing ioc becomes empty', () => {
    expect(mapSrvCountries({ data: [
      { id: '3', countryCode: 'CH', ioc: 'SUI' }, { id: 4, countryCode: '', ioc: 'X' }, { id: 5, ioc: 'Y' },
      null, 'CH', { id: 6, countryCode: 'DE' },
    ] })).toEqual([{ id: 6, countryCode: 'DE', ioc: '' }]);
  });

  it('anything that is not a list gives no countries', () => {
    expect(mapSrvCountries(null)).toEqual([]);
    expect(mapSrvCountries({ data: null })).toEqual([]);
    expect(mapSrvCountries('error')).toEqual([]);
  });
});

describe('adapter declarations', () => {
  const all = [srvMembersAdapter, srvMemberDetailAdapter, srvMembersAllAdapter];

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
    for (const a of [...all, srvCountriesAdapter]) expect(a.monthlyCap).toBeUndefined();
  });

  it('/all shares the member TTL; the country list is tenant-scoped and cached for a day', () => {
    expect(srvMembersAllAdapter.ttlSeconds).toBe(srvMembersAdapter.ttlSeconds);
    expect(srvCountriesAdapter.scope).toBe('tenant');
    expect(srvCountriesAdapter.requiresAuth).toBe(true);
    expect(srvCountriesAdapter.ttlSeconds).toBe(24 * 60 * 60);
  });

  it('lists every provider id a write must invalidate', () => {
    // If an adapter is added without extending this list, its cache would
    // survive a member edit and keep serving the pre-edit record.
    expect([...SRV_PROVIDER_IDS].sort()).toEqual(all.map((a) => a.id).sort());
  });
});
