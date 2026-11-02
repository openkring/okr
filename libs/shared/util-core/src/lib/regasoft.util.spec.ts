import { describe, expect, it } from 'vitest';

import { SrvIndex } from '@okr/shared-models';

import {
  classifyPhone,
  composeSekretariatMail,
  countryIdOf,
  expectedSrvStatus,
  getMismatches,
  getSekretariatCases,
  getSrvChanges,
  isSrvLinked,
  mailtoUrl,
  normalizePhone,
  phonesMatch,
  pickSrvMemberships,
  REGASOFT_COUNTRY_IDS,
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

  it('a different SRV number still links by name and full birth date (ruling: OR), but not alone', () => {
    expect(isSrvLinked(srvIndex({ memberId: '111', rServiceId: '222' }))).toBe(true);
    expect(isSrvLinked(srvIndex({ memberId: '111', rServiceId: '222', rDateOfBirth: '19900101' }))).toBe(false);
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

  it('reports a missing newsletter subscription', () => {
    const cases = getSekretariatCases([srvIndex({ hasNewsletter: false, rServiceId: '321' })]);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      caseKey: 'newsletter-1',
      caseType: 'newsletter',
      subjectKey: 'person.p1',
      line: '«Anna Muster, SRV-Nr. 321: Newsletter abonniert?»',
    });
  });

  it('shows a dash when the record has no SRV number', () => {
    const [c] = getSekretariatCases([srvIndex({ hasNewsletter: false, rServiceId: '' })]);
    expect(c.line).toBe('«Anna Muster, SRV-Nr. –: Newsletter abonniert?»');
  });

  it('reports the main club only for a member of our club', () => {
    expect(getSekretariatCases([srvIndex({ mainClub: false })]).map(c => c.caseKey)).toEqual(['mainClub-1']);
    expect(getSekretariatCases([srvIndex({ mainClub: false, mKey: '', personKey: '' })])).toEqual([]);
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

  it('keeps the case key stable across calls', () => {
    const idx = [srvIndex({ hasNewsletter: false })];
    expect(getSekretariatCases(idx)[0].caseKey).toBe(getSekretariatCases(idx)[0].caseKey);
  });
});

describe('composeSekretariatMail', () => {
  const cases = getSekretariatCases([
    srvIndex({ hasNewsletter: false, rServiceId: '321' }),
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
