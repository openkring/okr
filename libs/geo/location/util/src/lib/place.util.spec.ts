import { describe, it, expect } from 'vitest';
import { LocationModel } from '@okr/shared-models';
import { distanceKm } from '@okr/shared-util-core';
import { locationTypeOfPlace, matchSavedLocations, placeHitToLocation, searchTextOf, type PlaceHit } from './place.util';

const hit = (over: Partial<PlaceHit>): PlaceHit => ({
  name: 'Pfäffikon SZ', kind: 'locality', canton: 'SZ', municipality: 'Freienbach', zip: '', lat: 47.2, lng: 8.78, typeLabel: 'Ort', ...over,
});

const loc = (name: string, lat = 0, lng = 0, archived = false): LocationModel => {
  const l = new LocationModel('bka');
  l.name = name;
  l.latitude = lat;
  l.longitude = lng;
  l.isArchived = archived;
  return l;
};

describe('searchTextOf', () => {
  it('drops the comma and collapses blanks', () => {
    expect(searchTextOf('Pfäffikon, SZ')).toBe('Pfäffikon SZ');
    expect(searchTextOf(' Stäfa  ZH ')).toBe('Stäfa ZH');
  });
});

describe('locationTypeOfPlace', () => {
  it('maps kinds to location types', () => {
    expect(locationTypeOfPlace('municipality')).toBe('city');
    expect(locationTypeOfPlace('address')).toBe('address');
    expect(locationTypeOfPlace('mountain')).toBe('mountain');
    expect(locationTypeOfPlace('water')).toBe('water');
    expect(locationTypeOfPlace('locality')).toBe('geomarker');
    expect(locationTypeOfPlace('zip')).toBe('geomarker');
  });
});

describe('placeHitToLocation', () => {
  it('maps a locality with its municipality', () => {
    const l = placeHitToLocation(hit({}), 'bka');
    expect(l.name).toBe('Pfäffikon SZ');
    expect(l.type).toBe('geomarker');
    expect(l.latitude).toBe(47.2);
    expect(l.longitude).toBe(8.78);
    expect(l.address).toBe('Pfäffikon SZ, Gemeinde Freienbach');
    expect(l.tenants).toEqual(['bka']);
    expect(l.okey).toBe('');
  });
  it('maps a municipality', () => {
    const l = placeHitToLocation(hit({ name: 'Pfäffikon ZH', kind: 'municipality', municipality: '', canton: 'ZH' }), 'bka');
    expect(l.type).toBe('city');
    expect(l.address).toBe('Pfäffikon ZH');
  });
  it('maps a zip hit', () => {
    const l = placeHitToLocation(hit({ name: '8712 Stäfa', kind: 'zip', zip: '8712', municipality: '' }), 'bka');
    expect(l.address).toBe('8712 Stäfa');
  });
});

describe('matchSavedLocations', () => {
  const near = { lat: 47.2, lng: 8.78 };

  it('finds a saved place by the folded name before the comma', () => {
    const r = matchSavedLocations([loc('Pfäffikon SZ'), loc('Stäfa')], 'Pfaffikon, sz');
    expect(r.map(m => m.location.name)).toEqual(['Pfäffikon SZ']);
  });

  it('adds locations within 5 km of near, with their distance', () => {
    const freienbach = loc('Freienbach', 47.2, 8.78 + 1.1 / (111.32 * Math.cos((47.2 * Math.PI) / 180)));
    const far = loc('Weit weg', 47.2, 8.78 + 6 / (111.32 * Math.cos((47.2 * Math.PI) / 180)));
    const r = matchSavedLocations([freienbach, far], 'Pfäffikon', near);
    expect(r.map(m => m.location.name)).toEqual(['Freienbach']);
    expect(r[0].distanceKm).toBeCloseTo(distanceKm(near, { lat: freienbach.latitude, lng: freienbach.longitude }), 5);
    expect(r[0].distanceKm).toBeCloseTo(1.1, 1);
  });

  it('ignores archived and 0/0 locations for the distance part', () => {
    const r = matchSavedLocations([loc('A', 47.2, 8.78, true), loc('B')], 'xyz', near);
    expect(r).toEqual([]);
  });

  it('puts name matches before distance matches and caps at max', () => {
    const all = [loc('Nah 1', 47.201, 8.78), loc('Nah 2', 47.202, 8.78), loc('Pfäffikon SZ'), loc('Nah 3', 47.203, 8.78)];
    const r = matchSavedLocations(all, 'Pfäffikon SZ', near, 3);
    expect(r.map(m => m.location.name)).toEqual(['Pfäffikon SZ', 'Nah 1', 'Nah 2']);
  });
});
