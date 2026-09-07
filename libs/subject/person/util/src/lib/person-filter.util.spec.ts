import { describe, expect, it } from 'vitest';

import { parsePersonFilters, PERSON_FILTERS } from './person-filter.util';

describe('parsePersonFilters', () => {
  it('should return all filters when the parameter is missing', () => {
    expect(parsePersonFilters()).toEqual([...PERSON_FILTERS]);
    expect(parsePersonFilters(undefined)).toEqual([...PERSON_FILTERS]);
    expect(parsePersonFilters(null)).toEqual([...PERSON_FILTERS]);
    expect(parsePersonFilters('')).toEqual([...PERSON_FILTERS]);
  });

  it('should return only the listed filters', () => {
    expect(parsePersonFilters('search')).toEqual(['search']);
    expect(parsePersonFilters('search,tags')).toEqual(['search', 'tags']);
  });

  it('should trim, lowercase and deduplicate entries', () => {
    expect(parsePersonFilters(' Search , tags ,SEARCH')).toEqual(['search', 'tags']);
  });

  it('should drop unknown entries but keep the understood ones', () => {
    expect(parsePersonFilters('search,nonsense')).toEqual(['search']);
  });

  it('should fall back to all filters when nothing is understood', () => {
    expect(parsePersonFilters('nonsense')).toEqual([...PERSON_FILTERS]);
  });

  it('should return no filters for none', () => {
    expect(parsePersonFilters('none')).toEqual([]);
    expect(parsePersonFilters('search,none')).toEqual([]);
  });
});
