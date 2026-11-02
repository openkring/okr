import { describe, expect, it } from 'vitest';

import { SrvIndex } from '@okr/shared-models';

import {
  classifyPhone,
  countryIdOf,
  expectedSrvStatus,
  getMismatches,
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

/**
 * SrvIndex with every field neutral; overrides drive the case under test.
 * `rid` must be truthy (getMismatches short-circuits to [] otherwise, since an
 * empty `rid` means "no linked Regasoft record").
 */
function srvIndex(overrides: Partial<SrvIndex> = {}): SrvIndex {
  return { ...({} as SrvIndex), rid: '1', dateOfBirth: '', rDateOfBirth: '', ...overrides };
}

describe('getMismatches dateOfBirth', () => {
  it('does not report a mismatch when the local birth date is year-only', () => {
    const item = srvIndex({ dateOfBirth: '19850000', rDateOfBirth: '19850415' });
    expect(getMismatches(item).find(m => m.field === 'dateOfBirth')).toBeUndefined();
  });

  it('does not report a mismatch when the local birth date has no year', () => {
    const item = srvIndex({ dateOfBirth: '00000415', rDateOfBirth: '19850415' });
    expect(getMismatches(item).find(m => m.field === 'dateOfBirth')).toBeUndefined();
  });

  it('still reports a mismatch between two full birth dates', () => {
    const item = srvIndex({ dateOfBirth: '19850415', rDateOfBirth: '19860415' });
    expect(getMismatches(item).find(m => m.field === 'dateOfBirth')).toBeDefined();
  });

  it('reports nothing when the two full dates agree', () => {
    const item = srvIndex({ dateOfBirth: '19850415', rDateOfBirth: '19850415' });
    expect(getMismatches(item).find(m => m.field === 'dateOfBirth')).toBeUndefined();
  });
});

describe('normalizePhone / classifyPhone', () => {
  it('normalises Swiss formats', () => {
    expect(normalizePhone('+41 (0)79 123 45 67')).toBe('0791234567');
    expect(normalizePhone('0041 79 123 45 67')).toBe('0791234567');
    expect(normalizePhone('079-123.45.67')).toBe('0791234567');
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
