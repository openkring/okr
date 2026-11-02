import { describe, expect, it } from 'vitest';

import { SrvIndex } from '@okr/shared-models';

import {
  classifyPhone,
  countryIdOf,
  expectedSrvStatus,
  getMismatches,
  getSrvChanges,
  normalizePhone,
  phonesMatch,
  REGASOFT_COUNTRY_IDS,
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

  it('country: mapped code vs different Regasoft id → fix; unmapped code → skipped', () => {
    expect(mismatchOf({ mCountryCode: 'CH', rCountryId: '5' }, 'country')?.kind).toBe('fix');
    expect(mismatchOf({ mCountryCode: 'XX', rCountryId: '5' }, 'country')).toBeUndefined();
    expect(mismatchOf({ mCountryCode: '', rCountryId: '5' }, 'country')).toBeUndefined();
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

describe('getSrvChanges', () => {
  const changes = (o: Partial<SrvIndex>) => getSrvChanges(srvIndex(o), TODAY);

  it('matching item → empty change set', () => {
    expect(changes({})).toEqual({});
  });

  it('gender female → 2, anything else → 1', () => {
    expect(changes({ gender: 'female', rGender: 'male' })).toEqual({ gender: 2 });
    expect(changes({ gender: 'male', rGender: 'female' })).toEqual({ gender: 1 });
  });

  it('landline goes to telefon, mobile to mobile', () => {
    expect(changes({ mPhone: '044 111 22 33', rMobile: '', rTelefon: '044 999 99 99' })).toEqual({ telefon: '044 111 22 33' });
    expect(changes({ mPhone: '079 999 99 99' })).toEqual({ mobile: '079 999 99 99' });
  });

  it('maps dateOfBirth→birthday, zipCode→postcode, country→countryId', () => {
    expect(changes({ dateOfBirth: '19850416' })).toEqual({ birthday: '19850416' });
    expect(changes({ mZipCode: '3000' })).toEqual({ postcode: '3000' });
    expect(changes({ mCountryCode: 'CH', rCountryId: '5' })).toEqual({ countryId: 3 });
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
  it('maps CH to 3 and returns null for unknown or empty codes', () => {
    expect(REGASOFT_COUNTRY_IDS['CH']).toBe(3);
    expect(countryIdOf('CH')).toBe(3);
    expect(countryIdOf('ch')).toBe(3);
    expect(countryIdOf('XX')).toBeNull();
    expect(countryIdOf('')).toBeNull();
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
});
