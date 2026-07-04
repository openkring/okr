import { describe, expect, it } from 'vitest';
import { getSortedCountries } from './country.util';

/*
  This spec is intentionally kept in its own file, separate from country.util.spec.ts.
  country.util.spec.ts mocks the 'countries-list' and 'i18n-iso-countries' modules
  file-wide (vi.mock is hoisted) with a 3-country fixture (CH/DE/US) so its other
  tests stay fast and deterministic. getSortedCountries needs the REAL country
  dictionary (250 entries) and REAL localized names to be meaningfully tested, so
  it is exercised here against the unmocked libraries instead.
*/

describe('getSortedCountries', () => {
  it('returns every country with a code and a name', () => {
    const list = getSortedCountries('en');
    expect(list.length).toBeGreaterThan(150);
    expect(list.every(c => c.code.length === 2 && c.name.length > 0)).toBe(true);
  });

  it('includes CH and DE', () => {
    const codes = getSortedCountries('en').map(c => c.code);
    expect(codes).toContain('CH');
    expect(codes).toContain('DE');
  });

  it('is sorted alphabetically by localized name', () => {
    const names = getSortedCountries('en').map(c => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
