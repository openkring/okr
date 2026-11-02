import { describe, expect, it } from 'vitest';

import { SrvIndex } from '@okr/shared-models';

import {
  classifyPhone,
  composeSekretariatMail,
  countryIdOf,
  expectedSrvStatus,
  formatRegasoftModified,
  getMismatches,
  getSekretariatCases,
  getSrvChanges,
  isSrvLinked,
  mailtoUrl,
  makeSrvMatcher,
  makeSrvPairer,
  normalizePhone,
  phonesMatch,
  pickSrvMemberships,
  REGASOFT_COUNTRY_IDS,
  srvCategoryOf,
  srvCreateBlocker,
  storeDateToRegasoftDate,
} from './regasoft.util';

describe('storeDateToRegasoftDate', () => {
  it('converts a full StoreDate to a Regasoft ISO datetime', () => {
    expect(storeDateToRegasoftDate('19850415')).toBe('1985-04-15T00:00:00');
  });

  it('returns null for a year-only StoreDate instead of throwing', () => {
    expect(storeDateToRegasoftDate('19850000')).toBeNull();
  });

  it('returns null for a birthday without a year instead of throwing', () => {
    expect(storeDateToRegasoftDate('00000415')).toBeNull();
  });

  it('returns null for undefined and empty input', () => {
    expect(storeDateToRegasoftDate(undefined)).toBeNull();
    expect(storeDateToRegasoftDate('')).toBeNull();
  });
});

const TODAY = '20261102';

/**
 * SrvIndex where BK and Regasoft agree on every field; overrides drive the case under test.
 * `rid` is set (getMismatches short-circuits to [] without a linked Regasoft record).
 */
function srvIndex(overrides: Partial<SrvIndex> = {}): SrvIndex {
  return {
    key: 'anna muster',
    firstName: 'Anna',
    lastName: 'Muster',
    mKey: 'm1',
    personKey: 'p1',
    mDateOfExit: '99991231',
    dateOfBirth: '19850415',
    gender: 'female',
    state: 'active',
    mCategory: 'A',
    mEmail: 'anna@muster.ch',
    mPhone: '079 111 22 33',
    mStreet: 'Seestrasse 1',
    mZipCode: '8002',
    mCity: 'Zürich',
    mCountryCode: 'CH',
    mCountryId: '3',
    mDateOfDeath: '',
    mPassiveSince: '',
    pKey: '',
    memberId: '',
    pDateOfExit: '',
    pState: '',
    pCategory: '',
    indexField: '',
    rid: '1',
    rServiceId: '',
    rFirstName: 'Anna',
    rLastName: 'Muster',
    rEmail: 'anna@muster.ch',
    rGender: 'female',
    rMobile: '079 111 22 33',
    rTelefon: '',
    rStreet: 'Seestrasse 1',
    rZipCode: '8002',
    rCity: 'Zürich',
    rCountryId: '3',
    rDateOfBirth: '19850415',
    rCategory: 'A',
    rDateOfExit: '',
    rLeavingDate: '',
    rDateOfDeath: '',
    rInactiveDate: '',
    rEntryDate: '',
    nationIOC: 'SUI',
    hasNewsletter: true,
    mainClub: true,
    clubs: [],
    licenseId: '',
    licenseValidUntil: '',
    licenseImage: null,
    licenseImageName: null,
    licenseImageMimeType: null,
    rDetailLoaded: true,
    ...overrides,
  };
}

const mismatchOf = (o: Partial<SrvIndex>, field: string) => getMismatches(srvIndex(o), TODAY).find(m => m.field === field);

describe('getMismatches dateOfBirth', () => {
  it('does not report a mismatch when the local birth date is year-only', () => {
    expect(mismatchOf({ dateOfBirth: '19850000', rDateOfBirth: '19850415' }, 'dateOfBirth')).toBeUndefined();
  });

  it('does not report a mismatch when the local birth date has no year', () => {
    expect(mismatchOf({ dateOfBirth: '00000415', rDateOfBirth: '19850415' }, 'dateOfBirth')).toBeUndefined();
  });

  it('partial 19630000 vs full 19630412 → no mismatch', () => {
    expect(getMismatches(srvIndex({ dateOfBirth: '19630000', rDateOfBirth: '19630412' }), TODAY)).toEqual([]);
  });

  it('still reports a mismatch between two full birth dates', () => {
    expect(mismatchOf({ dateOfBirth: '19850415', rDateOfBirth: '19860415' }, 'dateOfBirth')?.kind).toBe('fix');
  });

  it('reports nothing when the two full dates agree', () => {
    expect(mismatchOf({ dateOfBirth: '19850415', rDateOfBirth: '19850415' }, 'dateOfBirth')).toBeUndefined();
  });
});

describe('getMismatches', () => {
  it('matching item → no mismatch', () => {
    expect(getMismatches(srvIndex(), TODAY)).toEqual([]);
  });

  it('item without a Regasoft record → no mismatch', () => {
    expect(getMismatches(srvIndex({ rid: '', rEmail: 'x@y.ch' }), TODAY)).toEqual([]);
  });

  it('email present in BK, empty in Regasoft → fix (D6)', () => {
    const r = getMismatches(srvIndex({ mEmail: 'a@b.ch', rEmail: '' }), TODAY);
    expect(r).toEqual([{ field: 'email', okrValue: 'a@b.ch', rValue: '', kind: 'fix' }]);
  });

  it('email differs only by case → no mismatch', () => {
    expect(mismatchOf({ mEmail: 'Anna@Muster.ch' }, 'email')).toBeUndefined();
  });

  it('email empty in BK, present in Regasoft → bk, never fix', () => {
    expect(mismatchOf({ mEmail: '', rEmail: 'anna@muster.ch' }, 'email')?.kind).toBe('bk');
  });

  it('gender differs → fix', () => {
    expect(mismatchOf({ gender: 'female', rGender: 'male' }, 'gender')?.kind).toBe('fix');
  });

  it('a club gender other than male/female → bk, never fix (I4)', () => {
    expect(mismatchOf({ gender: 'other', rGender: 'male' }, 'gender')).toEqual({ field: 'gender', okrValue: 'other', rValue: 'male', kind: 'bk' });
    expect(mismatchOf({ gender: 'other', rGender: 'female' }, 'gender')?.kind).toBe('bk');
    expect(mismatchOf({ gender: '', rGender: 'male' }, 'gender')?.kind).toBe('bk');
    expect(mismatchOf({ gender: '', rGender: '' }, 'gender')).toBeUndefined();
  });

  it('phone: BK number in Regasoft telefon → no mismatch', () => {
    expect(mismatchOf({ mPhone: '079 111 22 33', rMobile: '', rTelefon: '079 111 22 33' }, 'phone')).toBeUndefined();
  });

  it('phone: different landline → fix', () => {
    expect(mismatchOf({ mPhone: '044 111 22 33', rMobile: '', rTelefon: '044 999 99 99' }, 'phone')?.kind).toBe('fix');
  });

  it('phone: BK empty, Regasoft has a number → bk', () => {
    expect(mismatchOf({ mPhone: '', rMobile: '079 111 22 33' }, 'phone')?.kind).toBe('bk');
  });

  it('street and city differ → fix; zipCode differs → fix', () => {
    expect(mismatchOf({ mStreet: 'Bahnhofstrasse 2' }, 'street')?.kind).toBe('fix');
    expect(mismatchOf({ mCity: 'Bern' }, 'city')?.kind).toBe('fix');
    expect(mismatchOf({ mZipCode: '3000' }, 'zipCode')?.kind).toBe('fix');
  });

  it('country: our countryId vs a different Regasoft id → fix; a country Regasoft does not know → skipped', () => {
    expect(mismatchOf({ mCountryCode: 'CH', mCountryId: '3', rCountryId: '5' }, 'country')?.kind).toBe('fix');
    expect(mismatchOf({ mCountryCode: 'DE', mCountryId: '2', rCountryId: '3' }, 'country')).toMatchObject({ okrValue: 'DE', rValue: '3', kind: 'fix' });
    expect(mismatchOf({ mCountryCode: 'XX', mCountryId: '', rCountryId: '5' }, 'country')).toBeUndefined();
    expect(mismatchOf({ mCountryCode: '', mCountryId: '', rCountryId: '5' }, 'country')).toBeUndefined();
    expect(mismatchOf({ mCountryCode: 'CH', mCountryId: '3', rCountryId: '3' }, 'country')).toBeUndefined();
  });

  it('hasNewsletter false with rid → info', () => {
    const m = mismatchOf({ hasNewsletter: false }, 'hasNewsletter');
    expect(m?.kind).toBe('info');
  });

  it('mainClub false → info', () => {
    expect(mismatchOf({ mainClub: false }, 'mainClub')?.kind).toBe('info');
  });

  it('memberId and pCategory stay bk', () => {
    expect(mismatchOf({ memberId: '1', rServiceId: '2' }, 'memberId')?.kind).toBe('bk');
    expect(mismatchOf({ pKey: 'x', pCategory: 'P', rCategory: 'A' }, 'pCategory')?.kind).toBe('bk');
  });

  it('pCategory: an honorary member (E on both sides) is in sync; an unknown Regasoft type is not compared', () => {
    expect(mismatchOf({ pKey: 'x', pCategory: 'E', rCategory: srvCategoryOf('Honorary') }, 'pCategory')).toBeUndefined();
    expect(mismatchOf({ pKey: 'x', pCategory: 'A', rCategory: srvCategoryOf('Supporter') }, 'pCategory')).toBeUndefined();
  });

  it('exit sentinel 99991231 vs empty leavingDate → no mismatch', () => {
    expect(getMismatches(srvIndex({ mDateOfExit: '99991231', rLeavingDate: '' }), TODAY)).toEqual([]);
  });

  it('past exit → leavingDate fix; future exit → none', () => {
    expect(mismatchOf({ mDateOfExit: '20261031' }, 'leavingDate')?.kind).toBe('fix');
    expect(mismatchOf({ mDateOfExit: '20261231' }, 'leavingDate')).toBeUndefined();
  });

  it('death date in BK → dateOfDeath fix', () => {
    expect(mismatchOf({ mDateOfDeath: '20261015' }, 'dateOfDeath')?.kind).toBe('fix');
  });
});

describe('isSrvLinked', () => {
  it('links by SRV number: memberId equals rServiceId', () => {
    expect(isSrvLinked(srvIndex({ memberId: '555', rServiceId: '555', dateOfBirth: '19900101', firstName: 'Anni' }))).toBe(true);
  });

  it('links by the same name and the same full birth date', () => {
    expect(isSrvLinked(srvIndex({ memberId: '', rServiceId: '' }))).toBe(true);
  });

  it('compares names without case and surplus spaces', () => {
    expect(isSrvLinked(srvIndex({ firstName: 'anna ', lastName: ' MUSTER', memberId: '' }))).toBe(true);
  });

  it('does not link a same-named record with another full birth date', () => {
    expect(isSrvLinked(srvIndex({ memberId: '', rDateOfBirth: '19900101' }))).toBe(false);
  });

  it('does not link by name when the club birth date is partial or missing', () => {
    expect(isSrvLinked(srvIndex({ memberId: '', dateOfBirth: '19850000', rDateOfBirth: '19850000' }))).toBe(false);
    expect(isSrvLinked(srvIndex({ memberId: '', dateOfBirth: '', rDateOfBirth: '' }))).toBe(false);
  });

  it('a different SRV number never links, even with the same name and birth date (Task 9 0b)', () => {
    expect(isSrvLinked(srvIndex({ memberId: '111', rServiceId: '222' }))).toBe(false);
    expect(isSrvLinked(srvIndex({ memberId: '111', rServiceId: '222', rDateOfBirth: '19900101' }))).toBe(false);
    expect(getSrvChanges(srvIndex({ memberId: '111', rServiceId: '222', mCity: 'Bern' }), TODAY)).toEqual({});
  });

  it('a missing SRV number on either side still links by name and full birth date', () => {
    expect(isSrvLinked(srvIndex({ memberId: '', rServiceId: '222' }))).toBe(true);
    expect(isSrvLinked(srvIndex({ memberId: '111', rServiceId: '' }))).toBe(true);
  });

  it('a record another club entry also holds is never linked (Task 9 0a)', () => {
    const a = srvIndex({ mKey: 'm1', rid: '7' });
    const b = srvIndex({ mKey: 'm2', rid: '7' });
    const regasoftOnly = srvIndex({ mKey: '', rid: '7' });
    const other = srvIndex({ mKey: 'm3', rid: '8' });
    expect(isSrvLinked(a, [a, b])).toBe(false);
    expect(isSrvLinked(b, [a, b])).toBe(false);
    expect(isSrvLinked(a, [a, regasoftOnly, other])).toBe(true);
    expect(isSrvLinked(a)).toBe(true);
    expect(isSrvLinked({ ...a }, [a, other])).toBe(true);   // a copy of the entry is not its own duplicate
    expect(getSrvChanges({ ...a, mCity: 'Bern' }, TODAY, [{ ...a, mCity: 'Bern' }, b])).toEqual({});
  });

  it('never links an entry without a club membership or without a Regasoft record', () => {
    expect(isSrvLinked(srvIndex({ mKey: '' }))).toBe(false);
    expect(isSrvLinked(srvIndex({ rid: '' }))).toBe(false);
  });
});

describe('getSrvChanges for entries that are not linked (C1)', () => {
  it('a Regasoft-only passive record gets no change set', () => {
    // buildIndexEntry(undefined, undefined, r): no club membership, empty category → «active» expected
    const srvOnly = srvIndex({ mKey: '', personKey: '', mCategory: '', mDateOfExit: '', rInactiveDate: '20250101' });
    expect(getMismatches(srvOnly, TODAY).some(m => m.kind === 'fix')).toBe(true); // shown, but never written
    expect(getSrvChanges(srvOnly, TODAY)).toEqual({});
  });

  it('same name, another full birth date, no SRV number → no change set', () => {
    expect(getSrvChanges(srvIndex({ memberId: '', rDateOfBirth: '19900101', mEmail: 'neu@muster.ch' }), TODAY)).toEqual({});
  });

  it('linked by SRV number → the changes as before', () => {
    expect(getSrvChanges(srvIndex({ memberId: '5', rServiceId: '5', mEmail: 'neu@muster.ch' }), TODAY)).toEqual({ email: 'neu@muster.ch' });
  });

  it('linked by name and full birth date → the changes', () => {
    expect(getSrvChanges(srvIndex({ memberId: '', mEmail: 'neu@muster.ch' }), TODAY)).toEqual({ email: 'neu@muster.ch' });
  });
});

describe('getSrvChanges', () => {
  // Linked by SRV number, so a test may change the name or the birth date.
  const changes = (o: Partial<SrvIndex>) => getSrvChanges(srvIndex({ memberId: '5', rServiceId: '5', ...o }), TODAY);

  it('matching item → empty change set', () => {
    expect(changes({})).toEqual({});
  });

  it('gender female → 2, male → 1', () => {
    expect(changes({ gender: 'female', rGender: 'male' })).toEqual({ gender: 2 });
    expect(changes({ gender: 'male', rGender: 'female' })).toEqual({ gender: 1 });
  });

  it('an unknown club gender is never written as male (I4)', () => {
    expect(changes({ gender: 'other', rGender: 'female' })).toEqual({});
    expect(changes({ gender: 'diverse', rGender: '' })).toEqual({});
  });

  it('landline goes to telefon, mobile to mobile', () => {
    expect(changes({ mPhone: '044 111 22 33', rMobile: '', rTelefon: '044 999 99 99' })).toEqual({ telefon: '044 111 22 33' });
    expect(changes({ mPhone: '079 999 99 99' })).toEqual({ mobile: '079 999 99 99' });
  });

  it('maps dateOfBirth→birthday, zipCode→postcode, country→countryId', () => {
    expect(changes({ dateOfBirth: '19850416' })).toEqual({ birthday: '19850416' });
    expect(changes({ mZipCode: '3000' })).toEqual({ postcode: '3000' });
    expect(changes({ mCountryCode: 'CH', mCountryId: '3', rCountryId: '5' })).toEqual({ countryId: 3 });
    expect(changes({ mCountryCode: 'GB', mCountryId: '8', rCountryId: '3' })).toEqual({ countryId: 8 });
  });

  it('text fields are copied from BK', () => {
    expect(changes({ firstName: 'Anni', mEmail: 'neu@muster.ch', mStreet: 'Neuweg 3', mCity: 'Bern' })).toEqual({
      firstName: 'Anni',
      email: 'neu@muster.ch',
      street: 'Neuweg 3',
      city: 'Bern',
    });
  });

  it('info and bk differences never enter the change set', () => {
    expect(changes({ hasNewsletter: false, mainClub: false, memberId: '1', rServiceId: '2' })).toEqual({});
  });

  it('never clears a Regasoft value from an empty BK field', () => {
    expect(changes({ mEmail: '', rEmail: 'anna@muster.ch', mPhone: '', mStreet: '', rStreet: 'Seestrasse 1', mCity: '' })).toEqual({});
  });

  it('passive member → inactiveDate from passiveSince', () => {
    expect(changes({ mCategory: 'P', mPassiveSince: '20260101', rInactiveDate: '' })).toEqual({ inactiveDate: '20260101' });
  });

  it('passive without passiveSince: any full Regasoft inactiveDate is in sync', () => {
    const o = { mCategory: 'P', mPassiveSince: '', rInactiveDate: '20250101' };
    expect(mismatchOf(o, 'inactiveDate')).toBeUndefined();
    expect(changes(o)).toEqual({});
  });

  it('passive without passiveSince and empty Regasoft inactiveDate → today', () => {
    expect(changes({ mCategory: 'P', mPassiveSince: '', rInactiveDate: '' })).toEqual({ inactiveDate: TODAY });
  });

  it('active again (not passive): a Regasoft inactiveDate is still cleared', () => {
    expect(changes({ mCategory: 'A', mPassiveSince: '', rInactiveDate: '20250101' })).toEqual({ inactiveDate: '' });
  });

  it('passive with passiveSince: exact comparison', () => {
    const o = { mCategory: 'P', mPassiveSince: '20260101', rInactiveDate: '20250101' };
    expect(mismatchOf(o, 'inactiveDate')?.kind).toBe('fix');
    expect(changes(o)).toEqual({ inactiveDate: '20260101' });
  });

  it('passive + future exit → inactiveDate set, leavingDate empty', () => {
    const r = changes({ mCategory: 'P', mPassiveSince: '20260101', mDateOfExit: '20261231' });
    expect(r).toEqual({ inactiveDate: '20260101' });
  });

  it('passive + past exit → leavingDate set, inactiveDate cleared (exit beats passive)', () => {
    const r = changes({ mCategory: 'P', mPassiveSince: '20260101', mDateOfExit: '20261031', rInactiveDate: '20260101' });
    expect(r).toEqual({ leavingDate: '20261031', inactiveDate: '' });
  });

  it('re-join: no-exit sentinel with a Regasoft leavingDate → leavingDate cleared', () => {
    expect(changes({ mDateOfExit: '99991231', rLeavingDate: '20200101' })).toEqual({ leavingDate: '' });
  });

  it('death date → dateOfDeath', () => {
    expect(changes({ mDateOfDeath: '20261015' })).toEqual({ dateOfDeath: '20261015' });
  });

  it('never clears a Regasoft death date from an empty club field', () => {
    const o = { mDateOfDeath: '', rDateOfDeath: '20250101' };
    expect(mismatchOf(o, 'dateOfDeath')?.kind).toBe('bk');
    expect(changes(o)).not.toHaveProperty('dateOfDeath');
    expect(changes(o)).toEqual({});
  });

  it('sets a club death date that Regasoft lacks', () => {
    expect(changes({ mDateOfDeath: '20250101', rDateOfDeath: '' })).toEqual({ dateOfDeath: '20250101' });
  });

  it('overwrites a differing Regasoft death date with the club one', () => {
    expect(changes({ mDateOfDeath: '20250101', rDateOfDeath: '20240101' })).toEqual({ dateOfDeath: '20250101' });
  });
});

describe('normalizePhone / classifyPhone', () => {
  it('normalises Swiss formats', () => {
    expect(normalizePhone('+41 (0)79 123 45 67')).toBe('0791234567');
    expect(normalizePhone('0041 79 123 45 67')).toBe('0791234567');
    expect(normalizePhone('079-123.45.67')).toBe('0791234567');
  });
  it('drops a trunk zero after the Swiss code, with or without parentheses', () => {
    expect(normalizePhone('+41 079 790 89 29')).toBe('0797908929');
    expect(normalizePhone('0041 079 790 89 29')).toBe('0797908929');
    expect(normalizePhone('0041 (0)79 790 89 29')).toBe('0797908929');
  });
  it('maps other country codes to 00CC and handles empty input', () => {
    expect(normalizePhone('+49 171 1234567')).toBe('00491711234567');
    expect(normalizePhone('')).toBe('');
  });
  it('classifies 07x as mobile, everything else as telefon', () => {
    expect(classifyPhone('+41 79 790 89 29')).toBe('mobile');
    expect(classifyPhone('044 000 00 00')).toBe('telefon');
    expect(classifyPhone('+49 171 1234567')).toBe('telefon'); // foreign mobile: accepted (spec §8)
  });
  it('matches either Regasoft field', () => {
    expect(phonesMatch('079 790 89 29', '', '+41797908929')).toBe(true);
    expect(phonesMatch('', '', '')).toBe(true);
    expect(phonesMatch('044 000 00 00', '079 790 89 29', '')).toBe(false);
    expect(phonesMatch('', '079 790 89 29', '')).toBe(false);
  });
});

describe('countryIdOf', () => {
  // Shape of GET /api/nationIoc (probed 2026-11-02).
  const countries = [
    { id: 1, countryCode: 'AT', ioc: 'AUT' },
    { id: 3, countryCode: 'CH', ioc: 'SUI' },
    { id: 8, countryCode: 'GB', ioc: 'GBR' },
  ];

  it('without Regasoft\'s list: only the fallback CH = 3', () => {
    expect(REGASOFT_COUNTRY_IDS['CH']).toBe(3);
    expect(countryIdOf('CH')).toBe(3);
    expect(countryIdOf('ch')).toBe(3);
    expect(countryIdOf('GB')).toBeNull();
    expect(countryIdOf('XX')).toBeNull();
    expect(countryIdOf('')).toBeNull();
  });

  it('with the list: any listed code, case and blanks ignored', () => {
    expect(countryIdOf('GB', countries)).toBe(8);
    expect(countryIdOf(' at ', countries)).toBe(1);
    expect(countryIdOf('CH', countries)).toBe(3);
  });

  it('with the list: a code Regasoft does not list is null, not the fallback', () => {
    expect(countryIdOf('XX', countries)).toBeNull();
    expect(countryIdOf('CH', [{ id: 1, countryCode: 'AT', ioc: 'AUT' }])).toBeNull();
    expect(countryIdOf('', countries)).toBeNull();
  });
});

describe('formatRegasoftModified', () => {
  it('formats every fraction length Regasoft sends (probed 2026-11-02)', () => {
    expect(formatRegasoftModified('2026-11-02T17:04:04')).toBe('02.11.2026 17:04');
    expect(formatRegasoftModified('2026-11-02T17:04:04.5')).toBe('02.11.2026 17:04');
    expect(formatRegasoftModified('2026-11-02T17:04:04.54')).toBe('02.11.2026 17:04');
    expect(formatRegasoftModified('2026-11-02T07:04:04.541')).toBe('02.11.2026 07:04');
  });

  it('anything else is empty', () => {
    expect(formatRegasoftModified(null)).toBe('');
    expect(formatRegasoftModified(undefined)).toBe('');
    expect(formatRegasoftModified('')).toBe('');
    expect(formatRegasoftModified('2026-11-02')).toBe('');
    expect(formatRegasoftModified('02.11.2026 17:04')).toBe('');
    expect(formatRegasoftModified('2026-11-02T17:04:04Z')).toBe('');
  });
});

describe('srvCategoryOf', () => {
  it('maps the four Regasoft membership types to mcat_srv abbreviations', () => {
    expect(srvCategoryOf('Junior')).toBe('J');
    expect(srvCategoryOf('Active')).toBe('A');
    expect(srvCategoryOf('Passive')).toBe('P');
    expect(srvCategoryOf('Honorary')).toBe('E');   // not 'H': mcat_srv calls honorary E
  });

  it('an unknown, empty or differently cased type gives no category', () => {
    expect(srvCategoryOf('Supporter')).toBe('');
    expect(srvCategoryOf('active')).toBe('');
    expect(srvCategoryOf('')).toBe('');
    expect(srvCategoryOf(null)).toBe('');
    expect(srvCategoryOf(undefined)).toBe('');
  });
});

describe('expectedSrvStatus', () => {
  const base = { dateOfDeath: '', dateOfExit: '99991231', category: 'A', passiveSince: '', today: '20261102' };
  it('active member → all empty', () => {
    expect(expectedSrvStatus(base)).toEqual({ leavingDate: '', dateOfDeath: '', inactiveDate: '' });
  });
  it('keeps a future exit date out', () => {
    expect(expectedSrvStatus({ ...base, dateOfExit: '20261231' }).leavingDate).toBe('');
  });
  it('past exit → leavingDate', () => {
    expect(expectedSrvStatus({ ...base, dateOfExit: '20261031' }).leavingDate).toBe('20261031');
  });
  it('exit today counts', () => {
    expect(expectedSrvStatus({ ...base, dateOfExit: '20261102' }).leavingDate).toBe('20261102');
  });
  it('ignores a partial exit date', () => {
    expect(expectedSrvStatus({ ...base, dateOfExit: '20260000' }).leavingDate).toBe('');
  });
  it('death wins over exit', () => {
    expect(expectedSrvStatus({ ...base, dateOfExit: '20261031', dateOfDeath: '20261015' })).toEqual({
      leavingDate: '',
      dateOfDeath: '20261015',
      inactiveDate: '',
    });
  });
  it('passive → inactiveDate, falls back to today', () => {
    expect(expectedSrvStatus({ ...base, category: 'P', passiveSince: '20260101' }).inactiveDate).toBe('20260101');
    expect(expectedSrvStatus({ ...base, category: 'P' }).inactiveDate).toBe('20261102');
  });
  it('passiveSince today counts', () => {
    expect(expectedSrvStatus({ ...base, category: 'P', passiveSince: '20261102' }).inactiveDate).toBe('20261102');
  });
  it('a future passiveSince is not passive yet (Regasoft would show Passive at once)', () => {
    expect(expectedSrvStatus({ ...base, category: 'P', passiveSince: '20261201' }).inactiveDate).toBe('');
  });
  it('a partial passiveSince counts as missing → today, never a partial date', () => {
    expect(expectedSrvStatus({ ...base, category: 'P', passiveSince: '20260000' }).inactiveDate).toBe('20261102');
    expect(expectedSrvStatus({ ...base, category: 'P', passiveSince: '00000415' }).inactiveDate).toBe('20261102');
  });
  it('the no-exit sentinel as passiveSince counts as missing → today', () => {
    expect(expectedSrvStatus({ ...base, category: 'P', passiveSince: '99991231' }).inactiveDate).toBe('20261102');
  });
});

describe('entries without the Regasoft detail (I2)', () => {
  // The list carries no address, telefon, country, status dates, newsletter or clubs.
  const noDetail = (o: Partial<SrvIndex> = {}) => srvIndex({
    rDetailLoaded: false, rStreet: '', rZipCode: '', rCity: '', rTelefon: '', rCountryId: '',
    rLeavingDate: '', rDateOfDeath: '', rInactiveDate: '', hasNewsletter: false, clubs: [], ...o,
  });

  it('compares only what the list carries', () => {
    expect(getMismatches(noDetail({ mDateOfExit: '20261031', mCategory: 'A', mainClub: false, mPhone: '044 111 22 33', rMobile: '' }), TODAY)).toEqual([]);
  });

  it('still compares name, email, gender and birth date', () => {
    const fields = getMismatches(noDetail({ firstName: 'Anni', mEmail: 'neu@muster.ch', gender: 'male', dateOfBirth: '19850416' }), TODAY).map(m => m.field);
    expect(fields).toEqual(['firstName', 'gender', 'dateOfBirth', 'email']);
  });

  it('the change set holds no address, phone, country or status field', () => {
    const item = noDetail({ memberId: '5', rServiceId: '5', mEmail: 'neu@muster.ch', mCategory: 'P', mDateOfDeath: '20261015' });
    expect(getSrvChanges(item, TODAY)).toEqual({ email: 'neu@muster.ch' });
  });

  it('raises no Sekretariat case', () => {
    const linked = srvIndex({ rid: '1', rServiceId: '555', memberId: '555' });
    const extra = noDetail({ mKey: '', personKey: '', memberId: '', rServiceId: '', rid: '9' });
    expect(getSekretariatCases([linked, extra])).toEqual([]);
    expect(getSekretariatCases([noDetail({ pCategory: 'D' })])).toEqual([]);
    expect(getSekretariatCases([noDetail({ mainClub: false })])).toEqual([]);
  });
});

describe('an ended membership still in Regasoft (I1)', () => {
  it('the exit date reaches Regasoft after the exit day', () => {
    expect(getSrvChanges(srvIndex({ mDateOfExit: '20261031', rLeavingDate: '' }), TODAY)).toEqual({ leavingDate: '20261031' });
  });

  it('a deceased member with an ended membership gets the death date', () => {
    expect(getSrvChanges(srvIndex({ mDateOfExit: '20261015', mDateOfDeath: '20261015', rDateOfDeath: '' }), TODAY)).toEqual({ dateOfDeath: '20261015' });
  });
});

describe('passiveSince in getMismatches / getSrvChanges (C2, I5)', () => {
  const changes = (o: Partial<SrvIndex>) => getSrvChanges(srvIndex(o), TODAY);

  it('future passiveSince: a Regasoft inactiveDate is cleared, none is written', () => {
    expect(changes({ mCategory: 'P', mPassiveSince: '20261201', rInactiveDate: '' })).toEqual({});
    expect(changes({ mCategory: 'P', mPassiveSince: '20261201', rInactiveDate: '20261201' })).toEqual({ inactiveDate: '' });
  });

  it('partial passiveSince with an empty Regasoft inactiveDate → today (writable)', () => {
    expect(changes({ mCategory: 'P', mPassiveSince: '20260000', rInactiveDate: '' })).toEqual({ inactiveDate: TODAY });
  });

  it('partial passiveSince: any full Regasoft inactiveDate is in sync (like a missing one)', () => {
    const o = { mCategory: 'P', mPassiveSince: '20260000', rInactiveDate: '20250101' };
    expect(mismatchOf(o, 'inactiveDate')).toBeUndefined();
    expect(changes(o)).toEqual({});
  });
});

describe('pickSrvMemberships', () => {
  const m = (memberKey: string, dateOfEntry: string, dateOfExit: string, o: { relIsLast?: boolean; okey?: string } = {}) =>
    ({ memberKey, dateOfEntry, dateOfExit, relIsLast: o.relIsLast ?? true, okey: o.okey ?? `${memberKey}-${dateOfEntry}` });

  it('takes the membership in force today', () => {
    const a = m('p1', '20200101', '99991231');
    expect(pickSrvMemberships([a], TODAY)).toEqual([{ membership: a, ended: false }]);
  });

  it('a category change entered in advance: the old category is in force until the day before', () => {
    const old = m('p1', '20200101', '20261130', { relIsLast: false });
    const next = m('p1', '20261201', '99991231');
    expect(pickSrvMemberships([next, old], TODAY)).toEqual([{ membership: old, ended: false }]);
    expect(pickSrvMemberships([next, old], '20261201')).toEqual([{ membership: next, ended: false }]);
  });

  it('an exit today is still in force', () => {
    const a = m('p1', '20200101', TODAY);
    expect(pickSrvMemberships([a], TODAY)).toEqual([{ membership: a, ended: false }]);
  });

  it('an empty exit date is open', () => {
    const a = m('p1', '20200101', '');
    expect(pickSrvMemberships([a], TODAY)).toEqual([{ membership: a, ended: false }]);
  });

  it('none in force: a membership that starts later is taken, not ended', () => {
    const a = m('p1', '20270101', '99991231');
    expect(pickSrvMemberships([a], TODAY)).toEqual([{ membership: a, ended: false }]);
  });

  it('all ended: the end of the category chain is taken and flagged ended (I1)', () => {
    const junior = m('p1', '20100101', '20151231', { relIsLast: false });
    const active = m('p1', '20160101', '20261031');
    expect(pickSrvMemberships([active, junior], TODAY)).toEqual([{ membership: active, ended: true }]);
  });

  it('all ended: the chain end wins over a replaced membership with a later exit (inconsistent data)', () => {
    const replaced = m('p1', '20160101', '20261031', { relIsLast: false });
    const last = m('p1', '20100101', '20200101');
    expect(pickSrvMemberships([replaced, last], TODAY)).toEqual([{ membership: last, ended: true }]);
  });

  it('a re-joined member: the current membership wins over the ended one', () => {
    const left = m('p1', '20100101', '20151231');
    const back = m('p1', '20240101', '99991231');
    expect(pickSrvMemberships([left, back], TODAY)).toEqual([{ membership: back, ended: false }]);
  });

  it('one pick per person, in the order of first appearance', () => {
    const a = m('p2', '20200101', '99991231');
    const b = m('p1', '20200101', '99991231');
    const c = m('p2', '20100101', '20191231', { relIsLast: false });
    expect(pickSrvMemberships([a, b, c], TODAY).map(p => p.membership)).toEqual([a, b]);
  });
});

describe('makeSrvMatcher (C1)', () => {
  const rec = (srvId: number, serviceId: number | undefined, first: string, last: string, dob = '') =>
    ({ srvId, serviceId, firstName: first, lastName: last, dateOfBirth: dob });
  const q = (over: Partial<Parameters<ReturnType<typeof makeSrvMatcher>>[0]> = {}) =>
    ({ memberId: '', firstName: 'Hans', lastName: 'Muster', dateOfBirth: '19800201', ended: false, ...over });

  it('current record by SRV number before name', () => {
    const find = makeSrvMatcher([rec(1, 500, 'Hans', 'Muster'), rec(2, 600, 'Other', 'Person')], []);
    expect(find(q({ memberId: '600' }))?.srvId).toBe(2);
    expect(find(q())?.srvId).toBe(1);
  });

  it('a current membership re-joins a member who left, by SRV number', () => {
    const find = makeSrvMatcher([], [rec(3, 700, 'Hans', 'Muster', '19800201')]);
    expect(find(q({ memberId: '700', dateOfBirth: '' }))?.srvId).toBe(3);
  });

  it('a current membership re-joins by name only with the same full birth date', () => {
    const find = makeSrvMatcher([], [rec(3, 700, 'Hans', 'Muster', '19800201')]);
    expect(find(q())?.srvId).toBe(3);
    expect(find(q({ dateOfBirth: '19800202' }))).toBeUndefined();
    expect(find(q({ dateOfBirth: '' }))).toBeUndefined();
    expect(find(q({ dateOfBirth: '1980' }))).toBeUndefined();
  });

  it('a namesake who left years ago with another birth date is not taken (the son stays creatable)', () => {
    const find = makeSrvMatcher([], [rec(3, 700, 'Hans', 'Muster', '19501010')]);
    expect(find(q({ dateOfBirth: '19851212' }))).toBeUndefined();
  });

  it('among several namesakes who left, the one with the same birth date', () => {
    const find = makeSrvMatcher([], [rec(3, 700, 'Hans', 'Muster', '19501010'), rec(4, 701, 'Hans', 'Muster', '19800201')]);
    expect(find(q())?.srvId).toBe(4);
  });

  it('a current record with a different SRV number is skipped by name; another namesake may fit', () => {
    const find = makeSrvMatcher([rec(1, 222, 'Hans', 'Muster'), rec(2, undefined, 'Hans', 'Muster')], []);
    expect(find(q({ memberId: '111' }))?.srvId).toBe(2);
    expect(makeSrvMatcher([rec(1, 222, 'Hans', 'Muster')], [])(q({ memberId: '111' }))).toBeUndefined();
  });

  it('among current namesakes the one with the same full birth date wins', () => {
    const find = makeSrvMatcher([rec(1, 500, 'Hans', 'Muster', '19500101'), rec(2, 501, 'Hans', 'Muster', '19800201')], []);
    expect(find(q())?.srvId).toBe(2);
    expect(find(q({ dateOfBirth: '' }))?.srvId).toBe(1);
  });

  it('a departed record with a different SRV number is never matched by name', () => {
    const find = makeSrvMatcher([], [rec(3, 700, 'Hans', 'Muster', '19800201')]);
    expect(find(q({ memberId: '999' }))).toBeUndefined();
  });

  it('an ended membership matches only current records', () => {
    const find = makeSrvMatcher([rec(1, 500, 'Anna', 'Muster')], [rec(3, 700, 'Hans', 'Muster', '19800201')]);
    expect(find(q({ ended: true }))).toBeUndefined();
    expect(find(q({ ended: true, memberId: '700' }))).toBeUndefined();
    expect(find(q({ ended: true, firstName: 'Anna' }))?.srvId).toBe(1);
  });

  it('a current record wins over a departed one of the same name', () => {
    const find = makeSrvMatcher([rec(1, 500, 'Hans', 'Muster')], [rec(3, 700, 'Hans', 'Muster', '19800201')]);
    expect(find(q())?.srvId).toBe(1);
  });

  it('names compare without case and outer blanks; the first current namesake wins', () => {
    const find = makeSrvMatcher([rec(1, 500, 'Hans', 'Muster'), rec(2, 501, 'hans', 'muster')], []);
    expect(find(q({ firstName: ' HANS', lastName: 'Muster ' }))?.srvId).toBe(1);
  });

  it('nothing found → undefined', () => {
    expect(makeSrvMatcher([], [])(q())).toBeUndefined();
  });
});

describe('makeSrvPairer (Task 9 0a)', () => {
  const rec = (srvId: number, serviceId: number | undefined, first: string, last: string, dob = '') =>
    ({ srvId, serviceId, firstName: first, lastName: last, dateOfBirth: dob });
  const q = (over: Partial<Parameters<ReturnType<typeof makeSrvMatcher>>[0]> = {}) =>
    ({ memberId: '', firstName: 'Hans', lastName: 'Muster', dateOfBirth: '19800201', ended: false, ...over });
  const ids = (rs: { record: { srvId: number } | undefined }[]) => rs.map(r => r.record?.srvId);

  it('re-joined under a new person: the current membership gets the record, the ended one none', () => {
    const pairer = makeSrvPairer([rec(1, 500, 'Hans', 'Muster')], []);
    // ended first in the input: order of the list must not decide
    expect(ids(pairer.pair([q({ ended: true, memberId: '500' }), q({ memberId: '500' })]))).toEqual([undefined, 1]);
  });

  it('two current memberships with equally strong matches: the first keeps the record, the second is marked taken', () => {
    const pairer = makeSrvPairer([rec(1, 500, 'Hans', 'Muster')], []);
    const res = pairer.pair([q({ memberId: '500' }), q({ memberId: '500' })]);
    expect(ids(res)).toEqual([1, undefined]);
    expect(res.map(r => r.taken)).toEqual([false, true]);
  });

  it('a name-only match never takes the record from the member holding its SRV number — either order', () => {
    const records = [rec(1, 500, 'Hans', 'Muster', '19800201')];
    const nameOnly = q({ dateOfBirth: '19500101' });   // namesake, other birth date, no SRV number
    const owner = q({ memberId: '500' });
    expect(ids(makeSrvPairer(records, []).pair([nameOnly, owner]))).toEqual([undefined, 1]);
    expect(ids(makeSrvPairer(records, []).pair([owner, nameOnly]))).toEqual([1, undefined]);
  });

  it('name and birth date beat name only', () => {
    const records = [rec(1, 500, 'Hans', 'Muster', '19800201')];
    const nameOnly = q({ dateOfBirth: '19500101' });
    const nameAndDob = q({ dateOfBirth: '19800201' });
    expect(ids(makeSrvPairer(records, []).pair([nameOnly, nameAndDob]))).toEqual([undefined, 1]);
  });

  it('a membership with a different SRV number cannot take a record by name (0b)', () => {
    const pairer = makeSrvPairer([rec(1, 222, 'Hans', 'Muster', '19800201')], []);
    expect(ids(pairer.pair([q({ memberId: '111' })]))).toEqual([undefined]);
    expect(ids(pairer.pair([q({ memberId: '222', firstName: 'Other' })]))).toEqual([1]);
  });

  it('equal strength and status keep the given order (two ended memberships)', () => {
    const pairer = makeSrvPairer([rec(1, 500, 'Hans', 'Muster')], []);
    expect(ids(pairer.pair([q({ ended: true, memberId: '500' }), q({ ended: true, memberId: '500' })]))).toEqual([1, undefined]);
  });

  it('a later call cannot take a record an earlier call took (main before orphan SRV memberships)', () => {
    const pairer = makeSrvPairer([rec(1, 500, 'Hans', 'Muster'), rec(2, 600, 'Eva', 'Meier')], []);
    expect(ids(pairer.pair([q()]))).toEqual([1]);
    expect(ids(pairer.pair([q({ memberId: '500' }), q({ firstName: 'Eva', lastName: 'Meier' })]))).toEqual([undefined, 2]);
  });

  it('every record is given at most once, whatever the queries', () => {
    const current = [rec(1, 500, 'Hans', 'Muster'), rec(2, 600, 'Eva', 'Meier')];
    const pairer = makeSrvPairer(current, [rec(3, 700, 'Hans', 'Muster', '19800201')]);
    const got = ids(pairer.pair([q(), q({ memberId: '500' }), q({ memberId: '700' }), q({ ended: true }), q({ firstName: 'Eva', lastName: 'Meier' })]))
      .filter((x): x is number => x !== undefined);
    expect(new Set(got).size).toBe(got.length);
  });

  it('unpaired lists the records nobody took, current and departed apart', () => {
    const pairer = makeSrvPairer([rec(1, 500, 'Hans', 'Muster'), rec(2, 600, 'Eva', 'Meier')], [rec(3, 700, 'Otto', 'Alt', '19400101'), rec(4, 701, 'Hans', 'Muster', '19800201')]);
    pairer.pair([q(), q({ memberId: '701' })]);
    expect(pairer.unpaired().current.map(r => r.srvId)).toEqual([2]);
    expect(pairer.unpaired().left.map(r => r.srvId)).toEqual([3]);
  });
});

describe('srvCreateBlocker', () => {
  // A BK-only member (not in Regasoft), and the Regasoft-side entries around it.
  const candidate = (o: Partial<SrvIndex> = {}) => srvIndex({ rid: '', rDateOfBirth: '', memberId: '', ...o });
  const inRegasoft = (o: Partial<SrvIndex> = {}) => srvIndex({ mKey: '', personKey: '', rid: '42', ...o });

  it('blocks a member who already has a SRV number but no Regasoft link', () => {
    const item = candidate({ memberId: '12345' });
    expect(srvCreateBlocker(item, [item])).toBe('hasSrvNumber');
  });

  it('blocks when another Regasoft entry has the same name and full birth date', () => {
    const item = candidate();
    expect(srvCreateBlocker(item, [item, inRegasoft()])).toBe('duplicate');
  });

  it('lets the member through when the same name has another birth date', () => {
    const item = candidate();
    expect(srvCreateBlocker(item, [item, inRegasoft({ rDateOfBirth: '19900101' })])).toBeNull();
  });

  it('lets the member through when nobody else has the name', () => {
    const item = candidate();
    expect(srvCreateBlocker(item, [item, inRegasoft({ key: 'berta beispiel' })])).toBeNull();
  });

  it('ignores an index entry that is not in Regasoft', () => {
    const item = candidate();
    const other = candidate({ mKey: 'm2', rDateOfBirth: '19850415' });
    expect(srvCreateBlocker(item, [item, other])).toBeNull();
  });

  it('does not match on a partial birth date', () => {
    const item = candidate({ dateOfBirth: '19850000' });
    expect(srvCreateBlocker(item, [item, inRegasoft({ rDateOfBirth: '19850000' })])).toBeNull();
  });

  it('does not match when the Regasoft entry has no birth date', () => {
    const item = candidate({ dateOfBirth: '' });
    expect(srvCreateBlocker(item, [item, inRegasoft({ rDateOfBirth: '' })])).toBeNull();
  });

  it('never counts the item itself', () => {
    const item = srvIndex({ memberId: '', rid: '7' });
    expect(srvCreateBlocker(item, [item])).toBeNull();
  });

  it('a SRV number with a Regasoft link is not blocked as hasSrvNumber', () => {
    const item = srvIndex({ memberId: '12345', rid: '7' });
    expect(srvCreateBlocker(item, [item])).toBeNull();
  });

  it('reports hasSrvNumber before duplicate', () => {
    const item = candidate({ memberId: '12345' });
    expect(srvCreateBlocker(item, [item, inRegasoft()])).toBe('hasSrvNumber');
  });
});

describe('getSekretariatCases', () => {
  // A second Regasoft record of the same person: no BK link, own rid.
  const twin = (o: Partial<SrvIndex> = {}) =>
    srvIndex({ mKey: '', personKey: '', memberId: '', rServiceId: '', rid: '9', ...o });

  it('reports nothing when everything is in order', () => {
    expect(getSekretariatCases([srvIndex()])).toEqual([]);
  });

  it('reports the unlinked record of a pair as duplicate, keyed by its rid', () => {
    const linked = srvIndex({ rid: '1', rServiceId: '555', memberId: '555' });
    const extra = twin({ rid: '9', rServiceId: '777' });
    const cases = getSekretariatCases([linked, extra]);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      caseKey: 'duplicate-9',
      caseType: 'duplicate',
      externalRef: '9',
      subjectKey: '',
      line: '«Anna Muster, SRV-Nr. 777: doppelter Eintrag (ID 9), bitte löschen»',
    });
  });

  it('reports one case per surplus record of a triple', () => {
    const linked = srvIndex({ rid: '5', rServiceId: '555', memberId: '555' });
    const cases = getSekretariatCases([linked, twin({ rid: '6' }), twin({ rid: '7' })]);
    expect(cases.map(c => c.caseKey)).toEqual(['duplicate-6', 'duplicate-7']);
  });

  it('without any link keeps the lowest rid and reports the others', () => {
    const a = srvIndex({ mKey: '', personKey: '', rid: '12' });
    const b = srvIndex({ mKey: '', personKey: '', rid: '4' });
    const cases = getSekretariatCases([a, b]);
    expect(cases.map(c => c.caseKey)).toEqual(['duplicate-12']);
  });

  it('does not group people with the same name but another birth date', () => {
    const a = srvIndex({ rid: '1' });
    const b = twin({ rid: '2', rDateOfBirth: '19900101' });
    expect(getSekretariatCases([a, b])).toEqual([]);
  });

  it('does not group same-named records without a full birth date', () => {
    const a = srvIndex({ rid: '1', rDateOfBirth: '' });
    const b = twin({ rid: '2', rDateOfBirth: '' });
    expect(getSekretariatCases([a, b])).toEqual([]);
  });

  it('keeps a BK-only entry (no rid) out of the groups', () => {
    const bkOnly = srvIndex({ rid: '', rServiceId: '' });
    expect(getSekretariatCases([bkOnly, srvIndex({ rid: '3' })])).toEqual([]);
  });

  it('never reports the newsletter: we hold no consent to subscribe anyone (I3)', () => {
    expect(getSekretariatCases([srvIndex({ hasNewsletter: false, rServiceId: '321' })])).toEqual([]);
  });

  it('reports the main club with name, SRV number and subject', () => {
    const cases = getSekretariatCases([srvIndex({ mainClub: false, rServiceId: '321' })]);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      caseKey: 'mainClub-1',
      caseType: 'mainClub',
      subjectKey: 'person.p1',
      line: '«Anna Muster, SRV-Nr. 321: Hauptclub prüfen»',
    });
  });

  it('shows a dash when the record has no SRV number', () => {
    const [c] = getSekretariatCases([srvIndex({ mainClub: false, rServiceId: '' })]);
    expect(c.line).toBe('«Anna Muster, SRV-Nr. –: Hauptclub prüfen»');
  });

  it('reports the main club only for a member of our club', () => {
    expect(getSekretariatCases([srvIndex({ mainClub: false })]).map(c => c.caseKey)).toEqual(['mainClub-1']);
    expect(getSekretariatCases([srvIndex({ mainClub: false, mKey: '', personKey: '' })])).toEqual([]);
  });

  it('does not report the main club of a double member: another club is their main club (I3)', () => {
    expect(getSekretariatCases([srvIndex({ mainClub: false, mCategory: 'D', clubs: ['Seeclub', '!RC Andere'] })])).toEqual([]);
    expect(getSekretariatCases([srvIndex({ mainClub: false, pCategory: 'D', clubs: ['Seeclub', '!RC Andere'] })])).toEqual([]);
  });

  it('reports a double member of ours that Regasoft lists in one club only', () => {
    const cases = getSekretariatCases([srvIndex({ pCategory: 'D', clubs: ['!Seeclub'] })]);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ caseKey: 'doubleMembership-1', caseType: 'doubleMembership' });
    expect(cases[0].line).toContain('Doppelmitgliedschaft bei uns erfasst, in Regasoft nicht');
  });

  it('reports a double member by mCategory D as well, also with no club listed', () => {
    expect(getSekretariatCases([srvIndex({ mCategory: 'D', clubs: [] })]).map(c => c.caseKey)).toEqual(['doubleMembership-1']);
  });

  it('does not report a member with two clubs and no D category (known to the Sekretariat)', () => {
    expect(getSekretariatCases([srvIndex({ clubs: ['!Seeclub', 'RC Andere'] })])).toEqual([]);
  });

  it('does not report a D member that Regasoft already lists in several clubs', () => {
    expect(getSekretariatCases([srvIndex({ pCategory: 'D', clubs: ['!Seeclub', 'RC Andere'] })])).toEqual([]);
  });

  it('never reports a record the index matched to one of our members, even with the higher rid', () => {
    const matched = srvIndex({ rid: '9' });                       // mKey set, no serviceId link
    const other = twin({ rid: '3' });
    expect(getSekretariatCases([matched, other]).map(c => c.caseKey)).toEqual(['duplicate-3']);
  });

  it('reports no duplicate when two records of a group are linked (our data is ambiguous)', () => {
    const a = srvIndex({ rid: '1', rServiceId: '555', memberId: '555' });
    const b = srvIndex({ rid: '2', mKey: 'm2', personKey: 'p2' });
    expect(getSekretariatCases([a, b])).toEqual([]);
  });

  it('does not report newsletter or club cases for a record that is deleted anyway', () => {
    const linked = srvIndex({ rid: '1', rServiceId: '555', memberId: '555' });
    const extra = twin({ rid: '9', hasNewsletter: false, mainClub: false, clubs: ['a', 'b'] });
    expect(getSekretariatCases([linked, extra]).map(c => c.caseKey)).toEqual(['duplicate-9']);
  });

  it('reports a case once when two index entries point to the same Regasoft record', () => {
    // e.g. two members of ours with the same name, both matched to record 1 by name
    const a = srvIndex({ mainClub: false, pCategory: 'D', clubs: [] });
    const b = srvIndex({ mKey: 'm2', personKey: 'p2', mainClub: false, pCategory: 'D', clubs: [] });
    expect(getSekretariatCases([a, b]).map(c => c.caseKey)).toEqual(['doubleMembership-1']);
    const c = srvIndex({ mainClub: false });
    const d = srvIndex({ mKey: 'm2', personKey: 'p2', mainClub: false });
    expect(getSekretariatCases([c, d]).map(x => x.caseKey)).toEqual(['mainClub-1']);
  });

  it('keeps the case key stable across calls', () => {
    const idx = [srvIndex({ mainClub: false })];
    expect(getSekretariatCases(idx)[0].caseKey).toBe(getSekretariatCases(idx)[0].caseKey);
  });
});

describe('composeSekretariatMail', () => {
  const cases = getSekretariatCases([
    srvIndex({ mainClub: false, rServiceId: '321' }),
    srvIndex({ rid: '2', firstName: 'Ben', rFirstName: 'Ben', personKey: 'p2', mainClub: false, rServiceId: '' , key: 'ben muster', rDateOfBirth: '19700101'}),
  ]);

  it('uses the club name in the subject', () => {
    expect(composeSekretariatMail(cases, 'Seeclub Stäfa').subject).toBe('Mitgliedermutationen Seeclub Stäfa');
  });

  it('contains every line as a list item between greeting and closing', () => {
    const { body } = composeSekretariatMail(cases, 'Seeclub Stäfa');
    expect(cases).toHaveLength(2);
    for (const c of cases) expect(body).toContain(`- ${c.line}`);
    expect(body.startsWith('Hallo zusammen\n\n')).toBe(true);
    expect(body.endsWith('\n\nVielen Dank und freundliche Grüsse')).toBe(true);
  });

  it('puts one line per case, in order', () => {
    const lines = composeSekretariatMail(cases, 'X').body.split('\n').filter(l => l.startsWith('- '));
    expect(lines).toEqual(cases.map(c => `- ${c.line}`));
  });
});

describe('mailtoUrl', () => {
  it('encodes subject and body without a recipient', () => {
    const url = mailtoUrl({ subject: 'A & B', body: 'Grüsse\nZeile 2' });
    expect(url).toBe('mailto:?subject=A%20%26%20B&body=Gr%C3%BCsse%0AZeile%202');
  });

  it('returns null above 1800 characters', () => {
    expect(mailtoUrl({ subject: 'S', body: 'x'.repeat(1900) })).toBeNull();
  });

  it('accepts a URL of exactly 1800 characters', () => {
    const base = 'mailto:?subject=S&body='.length;
    const url = mailtoUrl({ subject: 'S', body: 'x'.repeat(1800 - base) });
    expect(url).not.toBeNull();
    expect(url?.length).toBe(1800);
  });

  it('counts the encoded length, not the raw length', () => {
    // 700 umlauts are 700 characters raw but 4200 encoded.
    expect(mailtoUrl({ subject: 'S', body: 'ü'.repeat(700) })).toBeNull();
  });
});
