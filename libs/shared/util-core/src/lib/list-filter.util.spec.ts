import { describe, expect, it } from 'vitest';

import { parseListFilters, LIST_FILTERS } from './list-filter.util';

describe('parseListFilters', () => {
  it('should return all filters when the parameter is missing', () => {
    expect(parseListFilters()).toEqual([...LIST_FILTERS]);
    expect(parseListFilters(undefined)).toEqual([...LIST_FILTERS]);
    expect(parseListFilters(null)).toEqual([...LIST_FILTERS]);
    expect(parseListFilters('')).toEqual([...LIST_FILTERS]);
  });

  it('should return only the listed filters', () => {
    expect(parseListFilters('search')).toEqual(['search']);
    expect(parseListFilters('search,tags')).toEqual(['search', 'tags']);
  });

  it('should trim, lowercase and deduplicate entries', () => {
    expect(parseListFilters(' Search , tags ,SEARCH')).toEqual(['search', 'tags']);
  });

  it('should drop unknown entries but keep the understood ones', () => {
    expect(parseListFilters('search,nonsense')).toEqual(['search']);
  });

  it('should fall back to all filters when nothing is understood', () => {
    expect(parseListFilters('nonsense')).toEqual([...LIST_FILTERS]);
  });

  it('should return no filters for none', () => {
    expect(parseListFilters('none')).toEqual([]);
    expect(parseListFilters('search,none')).toEqual([]);
  });
});
