import { describe, expect, it } from 'vitest';
import { getBfsNr, getLocationProperty, LOCATION_PROPERTY_BFS_NR, setLocationProperty } from './location-property.util';

describe('location properties', () => {
  it('coalesces a legacy location without properties', () => {
    expect(getLocationProperty({}, LOCATION_PROPERTY_BFS_NR)).toBeUndefined();
    expect(getBfsNr({})).toBeUndefined();
  });

  it('reads bfsNr as a number from the string the form stores', () => {
    expect(getBfsNr({ properties: [{ key: 'bfsNr', value: '158' }] })).toBe(158);
    expect(getBfsNr({ properties: [{ key: 'bfsNr', value: 158 }] })).toBe(158);
  });

  it('treats an unusable bfsNr as absent', () => {
    expect(getBfsNr({ properties: [{ key: 'bfsNr', value: 'abc' }] })).toBeUndefined();
    expect(getBfsNr({ properties: [{ key: 'bfsNr', value: '' }] })).toBeUndefined();
  });

  it('sets, replaces and removes without mutating', () => {
    const start = [{ key: 'a', value: '1' }];
    expect(setLocationProperty(start, 'bfsNr', '158')).toEqual([{ key: 'a', value: '1' }, { key: 'bfsNr', value: '158' }]);
    expect(setLocationProperty(start, 'a', '2')).toEqual([{ key: 'a', value: '2' }]);
    expect(setLocationProperty(start, 'a', undefined)).toEqual([]);
    expect(start).toEqual([{ key: 'a', value: '1' }]);
  });

  it('starts from an empty list when the location has none', () => {
    expect(setLocationProperty(undefined, 'bfsNr', '158')).toEqual([{ key: 'bfsNr', value: '158' }]);
  });
});
