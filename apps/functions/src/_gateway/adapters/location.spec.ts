// apps/functions/src/_gateway/adapters/location.spec.ts
import { describe, it, expect } from 'vitest';
import {
  roundCoord,
  normaliseCoordParams,
  mapW3wCoords,
  mapW3wWords,
  assertGmapUsable,
  mapGmapCoords,
  mapGmapAddress,
  w3wToCoordsAdapter,
  coordsToW3wAdapter,
  gmapGeocodeAdapter,
  gmapReverseAdapter,
} from './location';

describe('roundCoord / normaliseCoordParams', () => {
  it('rounds to 6 decimals so float noise cannot fragment the cache', () => {
    expect(roundCoord(47.24149999999999)).toBe(47.2415);
    expect(roundCoord(8.7231234567)).toBe(8.723123);
  });
  it('keeps a coordinate that is already short', () => {
    expect(roundCoord(47.2415)).toBe(47.2415);
    expect(roundCoord(0)).toBe(0);
  });
  it('handles negative coordinates symmetrically', () => {
    expect(roundCoord(-8.7231239)).toBe(-8.723124);
  });
  it('normalises both members', () => {
    expect(normaliseCoordParams({ lat: 47.24150000001, lng: -8.7231239 })).toEqual({
      lat: 47.2415,
      lng: -8.723124,
    });
  });
});

describe('what3words mapping', () => {
  it('maps coordinates', () => {
    expect(mapW3wCoords({ coordinates: { lat: 47.2415, lng: 8.7231 } })).toEqual({
      lat: 47.2415,
      lng: 8.7231,
    });
  });
  it('returns null when coordinates are absent or malformed', () => {
    expect(mapW3wCoords({})).toBeNull();
    expect(mapW3wCoords({ coordinates: { lat: 47.2415 } })).toBeNull();
  });
  it('maps and trims words, null when empty', () => {
    expect(mapW3wWords({ words: ' filled.count.soap ' })).toBe('filled.count.soap');
    expect(mapW3wWords({ words: '' })).toBeNull();
    expect(mapW3wWords({})).toBeNull();
  });
});

describe('assertGmapUsable', () => {
  // Google reports failures with HTTP 200 + a status string. Anything other than
  // OK/ZERO_RESULTS must throw so it is never written to a 30-day cache.
  it('accepts OK and ZERO_RESULTS', () => {
    expect(() => assertGmapUsable({ status: 'OK', results: [] })).not.toThrow();
    expect(() => assertGmapUsable({ status: 'ZERO_RESULTS', results: [] })).not.toThrow();
  });
  it('throws on REQUEST_DENIED — a broken key must not cache as "not found"', () => {
    expect(() => assertGmapUsable({ status: 'REQUEST_DENIED' })).toThrow(/REQUEST_DENIED/);
  });
  it('throws on OVER_QUERY_LIMIT and on a missing status', () => {
    expect(() => assertGmapUsable({ status: 'OVER_QUERY_LIMIT' })).toThrow();
    expect(() => assertGmapUsable({})).toThrow();
  });
});

describe('Google Maps mapping', () => {
  it('maps the first result geometry', () => {
    const raw = { status: 'OK', results: [{ geometry: { location: { lat: 47.2, lng: 8.7 } } }] };
    expect(mapGmapCoords(raw)).toEqual({ lat: 47.2, lng: 8.7 });
  });
  it('maps the first formatted_address', () => {
    const raw = { status: 'OK', results: [{ formatted_address: 'Seestrasse 1, 8712 Stäfa' }] };
    expect(mapGmapAddress(raw)).toBe('Seestrasse 1, 8712 Stäfa');
  });
  it('returns null for ZERO_RESULTS — a real, cacheable "no answer"', () => {
    expect(mapGmapCoords({ status: 'ZERO_RESULTS', results: [] })).toBeNull();
    expect(mapGmapAddress({ status: 'ZERO_RESULTS', results: [] })).toBeNull();
  });
});

describe('adapter declarations', () => {
  const all = [w3wToCoordsAdapter, coordsToW3wAdapter, gmapGeocodeAdapter, gmapReverseAdapter];

  it('gives every adapter a distinct id — ids namespace the cache and the quota counter', () => {
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
  });
  it('is shared-scoped and authenticated throughout', () => {
    for (const a of all) {
      expect(a.scope).toBe('shared');
      expect(a.requiresAuth).toBe(true);
    }
  });
  it('caps every adapter monthly — both keys are ours, so the failure mode is a bill', () => {
    for (const a of all) expect(a.monthlyCap).toBe(10_000);
  });
  it('holds the Google adapters to the 30-day platform caching ceiling', () => {
    expect(gmapGeocodeAdapter.ttlSeconds).toBe(30 * 24 * 60 * 60);
    expect(gmapReverseAdapter.ttlSeconds).toBe(30 * 24 * 60 * 60);
  });
  it('caches the deterministic what3words mapping for longer', () => {
    expect(w3wToCoordsAdapter.ttlSeconds).toBe(180 * 24 * 60 * 60);
    expect(coordsToW3wAdapter.ttlSeconds).toBe(180 * 24 * 60 * 60);
  });
});
