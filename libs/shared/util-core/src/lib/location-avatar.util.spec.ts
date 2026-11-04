import { describe, expect, it } from 'vitest';

import { freeTextLocationAvatar, getEventLocationKey, getEventLocationName, locationToAvatar, positionToLocationAvatar } from './location-avatar.util';

describe('location avatars', () => {
  const halle = locationToAvatar({ okey: 'l1', name: 'Halle', type: 'building' });

  it('keys a predefined location by its okey', () => {
    expect(halle).toEqual({ key: 'l1', name1: 'Halle', name2: '', label: 'Halle', modelType: 'location', type: 'building', subType: '' });
  });

  it('keeps free text as typed, so a trailing space survives the next key press', () => {
    expect(freeTextLocationAvatar('Boots ').label).toBe('Boots ');
    expect(freeTextLocationAvatar('Boots').key).toBe('');
  });

  it('writes a position as coordinates', () => {
    expect(positionToLocationAvatar(47.2309612, 8.7492145).label).toBe('47.23096, 8.74921');
    expect(positionToLocationAvatar(47.5, 8).key).toBe('');
  });
});

describe('getEventLocationName', () => {
  it('reads the first location', () => {
    expect(getEventLocationName({ locations: [freeTextLocationAvatar('Halle'), freeTextLocationAvatar('Bad')] })).toBe('Halle');
  });

  it('copes with an event that has none', () => {
    expect(getEventLocationName({ locations: [] })).toBe('');
    expect(getEventLocationName({})).toBe('');
    expect(getEventLocationName(undefined)).toBe('');
  });
});

describe('getEventLocationKey', () => {
  it('returns the okey of a predefined location', () => {
    expect(getEventLocationKey({ locations: [locationToAvatar({ okey: 'l1', name: 'Halle', type: '' })] })).toBe('l1');
  });

  it('is empty for free text and for no location', () => {
    expect(getEventLocationKey({ locations: [freeTextLocationAvatar('Halle')] })).toBe('');
    expect(getEventLocationKey({})).toBe('');
  });
});
