import { describe, expect, it } from 'vitest';

import { CONNECTIONS_CONFIG_SHAPE, ConnectionsConfig, LocationModel } from '@okr/shared-models';

import type { TransitPlace } from './transit-place.model';
import { eventPlaceLabel, favoritePlaces, isPrivatePlace, placeFromLocation, postalLine, sbbPlaceLabel } from './transit-place.util';

function loc(okey: string, name: string, latitude = 47.2, longitude = 8.7): LocationModel {
  return Object.assign(new LocationModel('scs'), { okey, name, latitude, longitude });
}
const cfg = (p: Partial<ConnectionsConfig> = {}): ConnectionsConfig => ({
  ...CONNECTIONS_CONFIG_SHAPE, favoriteDefaultOrg: true, favoriteHomeAddress: true, favoriteLocationKeys: [], ...p,
});
const org = { name: 'SCS', address: 'Seestrasse 1, 8712 Stäfa, CH' };

describe('favoritePlaces', () => {
  it('orders org, home, then pinned by key list', () => {
    const r = favoritePlaces({
      cfg: cfg({ favoriteLocationKeys: ['b', 'a'] }), org, home: 'Weg 2, 8000 Zürich, CH',
      pinned: [loc('a', 'A'), loc('b', 'B')], homeLabel: 'Meine Adresse',
    });
    expect(r.map((p) => p.kind)).toEqual(['org', 'home', 'location', 'location']);
    expect(r.map((p) => p.label)).toEqual(['SCS', 'Meine Adresse', 'B', 'A']);
    expect(r[0].address).toBe(org.address);
    expect(r[1].address).toBe('Weg 2, 8000 Zürich, CH');
  });
  it('skips home when switched off', () => {
    const r = favoritePlaces({ cfg: cfg({ favoriteHomeAddress: false }), org, home: 'x', pinned: [], homeLabel: 'H' });
    expect(r.map((p) => p.kind)).toEqual(['org']);
  });
  it('skips org without address and home without address', () => {
    const r = favoritePlaces({ cfg: cfg(), org: { name: 'SCS', address: '' }, home: '', pinned: [], homeLabel: 'H' });
    expect(r).toEqual([]);
  });
  it('skips org when switched off or missing', () => {
    expect(favoritePlaces({ cfg: cfg({ favoriteDefaultOrg: false }), org, pinned: [], homeLabel: 'H' })).toEqual([]);
    expect(favoritePlaces({ cfg: cfg(), pinned: [], homeLabel: 'H' })).toEqual([]);
  });
  it('follows the key list, not the input order, and skips unknown keys', () => {
    const r = favoritePlaces({
      cfg: cfg({ favoriteDefaultOrg: false, favoriteLocationKeys: ['c', 'x', 'a'] }),
      pinned: [loc('a', 'A'), loc('c', 'C')], homeLabel: 'H',
    });
    expect(r.map((p) => p.locationKey)).toEqual(['c', 'a']);
  });
});

describe('postalLine', () => {
  const e = { streetName: 'Seestrasse', streetNumber: '1', zipCode: '8712', city: 'Stäfa', countryCode: 'CH' };
  it('joins the parts', () => expect(postalLine(e)).toBe('Seestrasse 1, 8712 Stäfa, CH'));
  it('works without number', () => expect(postalLine({ ...e, streetNumber: '' })).toBe('Seestrasse, 8712 Stäfa, CH'));
  it('leaves out empty zip and country', () => {
    expect(postalLine({ ...e, zipCode: '', countryCode: '' })).toBe('Seestrasse 1, Stäfa');
  });
  it('is empty without street or city', () => {
    expect(postalLine({ ...e, streetName: '' })).toBe('');
    expect(postalLine({ ...e, city: '' })).toBe('');
  });
});

describe('isPrivatePlace', () => {
  it.each([['current', true], ['home', true], ['org', false], ['location', false]] as const)('%s', (kind, expected) => {
    expect(isPrivatePlace({ kind, label: 'x' })).toBe(expected);
  });
});

describe('placeFromLocation', () => {
  it('carries key, label and point', () => {
    expect(placeFromLocation(loc('a', 'Bahnhof', 47.1, 8.6))).toEqual({
      kind: 'location', label: 'Bahnhof', locationKey: 'a', point: { lat: 47.1, lng: 8.6 },
    });
  });
  it('has no point without coordinates', () => {
    expect(placeFromLocation(loc('a', 'X', 0, 0)).point).toBeUndefined();
  });
});

describe('eventPlaceLabel', () => {
  const labels = { current: 'Aktueller Standort', home: 'Meine Adresse' };
  it('never returns the home address', () => {
    const p: TransitPlace = { kind: 'home', label: 'Weg 2, 8000 Zürich', address: 'Weg 2, 8000 Zürich, CH' };
    expect(eventPlaceLabel(p, labels)).toBe('Meine Adresse');
  });
  it('maps current and passes others through', () => {
    expect(eventPlaceLabel({ kind: 'current', label: '47.1,8.6' }, labels)).toBe('Aktueller Standort');
    expect(eventPlaceLabel({ kind: 'org', label: 'SCS' }, labels)).toBe('SCS');
    expect(eventPlaceLabel({ kind: 'location', label: 'Bahnhof' }, labels)).toBe('Bahnhof');
  });
});

describe('sbbPlaceLabel', () => {
  const labels = { start: 'Start', end: 'Ziel' };
  it('names private places neutrally by role', () => {
    const home: TransitPlace = { kind: 'home', label: 'Meine Adresse', address: 'Weg 2, 8000 Zürich, CH' };
    const current: TransitPlace = { kind: 'current', label: 'Aktueller Standort' };
    expect(sbbPlaceLabel(home, 'from', labels)).toBe('Start');
    expect(sbbPlaceLabel(home, 'to', labels)).toBe('Ziel');
    expect(sbbPlaceLabel(current, 'from', labels)).toBe('Start');
    expect(sbbPlaceLabel(current, 'to', labels)).toBe('Ziel');
  });
  it('passes public places through', () => {
    expect(sbbPlaceLabel({ kind: 'org', label: 'SCS' }, 'from', labels)).toBe('SCS');
    expect(sbbPlaceLabel({ kind: 'location', label: 'Bahnhof' }, 'to', labels)).toBe('Bahnhof');
  });
});
