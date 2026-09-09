import { describe, expect, it } from 'vitest';
import { vcardDateToStoreDate } from './vcard-import-dates';

describe('vcardDateToStoreDate', () => {
  it('converts a full date in both notations', () => {
    expect(vcardDateToStoreDate('1985-04-15')).toBe('19850415');
    expect(vcardDateToStoreDate('19850415')).toBe('19850415');
  });

  it('converts a year-unknown birthday to dayMonthOnly', () => {
    expect(vcardDateToStoreDate('--0415')).toBe('00000415');
    expect(vcardDateToStoreDate('--04-15')).toBe('00000415');
  });

  it('converts a bare year to yearOnly', () => {
    expect(vcardDateToStoreDate('1985')).toBe('19850000');
  });

  it('rejects an impossible date without throwing', () => {
    expect(vcardDateToStoreDate('2001-02-30')).toBe('');
    expect(vcardDateToStoreDate('--0230')).toBe('');
    expect(vcardDateToStoreDate('1985-13-01')).toBe('');
  });

  it('rejects junk, empty and undefined input', () => {
    expect(vcardDateToStoreDate('irgendwann')).toBe('');
    expect(vcardDateToStoreDate('')).toBe('');
    expect(vcardDateToStoreDate(undefined)).toBe('');
  });

  it('ignores a time component', () => {
    expect(vcardDateToStoreDate('1985-04-15T10:00:00Z')).toBe('19850415');
  });
});
