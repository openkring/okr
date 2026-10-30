// apps/functions/src/_gateway/adapters/elevation.spec.ts
import { describe, it, expect } from 'vitest';
import { heightsFromProfile, inSwitzerland, openMeteoElevationAdapter, swisstopoElevationAdapter, wgs84ToLv95 } from './elevation';

describe('wgs84ToLv95', () => {
  it('matches swisstopo\'s worked example within ~1 m', () => {
    // swisstopo «Approximate formulas»: 46°02'38.87" N, 8°43'49.79" E → E 2'699'999.76, N 1'099'999.97
    const [e, n] = wgs84ToLv95(46 + 2 / 60 + 38.87 / 3600, 8 + 43 / 60 + 49.79 / 3600);
    expect(Math.abs(e - 2699999.76)).toBeLessThan(1);
    expect(Math.abs(n - 1099999.97)).toBeLessThan(1);
  });
});

describe('inSwitzerland', () => {
  it('accepts Zurich, rejects Munich', () => {
    expect(inSwitzerland({ lat: 47.37, lng: 8.54 })).toBe(true);
    expect(inSwitzerland({ lat: 48.14, lng: 11.58 })).toBe(false);
  });
});

describe('heightsFromProfile', () => {
  // shape of a real profile.json answer (2026-10-30), dist in LV95 metres
  const rows = [
    { dist: 0, alts: { COMB: 400, DTM2: 400, DTM25: 401 } },
    { dist: 100, alts: { COMB: 410, DTM2: 410, DTM25: 411 } },
    { dist: 200, alts: { COMB: null, DTM2: 430, DTM25: 431 } },
  ];

  it('interpolates at the points\' own distance along the line', () => {
    const start = { lat: 47.37, lng: 8.54 };
    const [e, n] = wgs84ToLv95(start.lat, start.lng);
    // a second point ~50 m east: invert roughly via the scale of 1e-5 deg lng ≈ 0.75 m at 47°
    const east = { lat: start.lat, lng: start.lng + 50 / 75000 };
    const [e2] = wgs84ToLv95(east.lat, east.lng);
    expect(e2 - e).toBeGreaterThan(40);
    const alts = heightsFromProfile([start, east], rows);
    expect(alts[0]).toBe(400);
    expect(alts[1]).toBeGreaterThan(403);
    expect(alts[1]).toBeLessThan(407);
    expect(n).toBeGreaterThan(1_000_000);
  });

  it('falls back to DTM2 when COMB is missing, and to null without any height', () => {
    expect(heightsFromProfile([{ lat: 47, lng: 8 }], [rows[2]])).toEqual([430]);
    expect(heightsFromProfile([{ lat: 47, lng: 8 }], [])).toEqual([null]);
  });
});

describe('adapters', () => {
  it('are user-scoped (a route is personal data) and need auth', () => {
    for (const a of [swisstopoElevationAdapter, openMeteoElevationAdapter]) {
      expect(a.scope).toBe('user');
      expect(a.requiresAuth).toBe(true);
      expect(a.secrets).toEqual([]);
    }
  });

  it('Open-Meteo maps one height per point, null where missing', () => {
    const points = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }];
    expect(openMeteoElevationAdapter.map({ elevation: [422, null] }, { points })).toEqual([422, null, null]);
  });
});
