import { describe, expect, it } from 'vitest';
import type { TrackPoint } from './track-polyline.util';
import {
  altitudeCoverage, decodeAltitudes, elevationProfile, encodeAltitudes, hasRelief, needsTerrain, sectionsWithHeights, terrainAltitudes,
  terrainSamples, thinProfile, withAltitudes,
} from './track-elevation.util';
import { buildGpx } from './track-pages.util';

/** n points going north, ~11 m apart, with the given heights (undefined = no height). */
function line(alts: (number | undefined)[], lat0 = 47): TrackPoint[] {
  return alts.map((alt, i) => {
    const p: TrackPoint = { lat: lat0 + i * 0.0001, lng: 8, t: i * 1000 };
    if (alt !== undefined) p.alt = alt;
    return p;
  });
}

describe('encodeAltitudes / decodeAltitudes', () => {
  it('round-trips heights with gaps', () => {
    const pts = line([400, 402, undefined, 399, 410]);
    const s = encodeAltitudes(pts);
    expect(s).toBe('400,2,,-3,11');
    expect(decodeAltitudes(s, 5)).toEqual([400, 402, undefined, 399, 410]);
  });

  it('is undefined without any height, and decodes to undefined', () => {
    expect(encodeAltitudes(line([undefined, undefined]))).toBeUndefined();
    expect(decodeAltitudes(undefined, 2)).toEqual([undefined, undefined]);
  });

  it('ignores broken entries and extra values', () => {
    expect(decodeAltitudes('5,x,1,7', 3)).toEqual([5, undefined, 6]);
  });

  it('withAltitudes sets only the given heights', () => {
    const pts = withAltitudes(line([undefined, 3]), [10, undefined]);
    expect(pts.map((p) => p.alt)).toEqual([10, 3]);
  });
});

describe('elevationProfile', () => {
  it('is undefined below two points with a height', () => {
    expect(elevationProfile([{ mode: 'foot', points: line([400, undefined]) }])).toBeUndefined();
  });

  it('counts a steady climb and its descent', () => {
    const up = Array.from({ length: 50 }, (_, i) => 400 + i * 2); // ~550 m, +98 m
    const down = [...up].reverse();
    const p = elevationProfile([{ mode: 'foot', points: line([...up, ...down]) }]);
    expect(p).toBeDefined();
    expect(p?.gainM).toBeGreaterThan(80);
    expect(p?.lossM).toBeGreaterThan(80);
    expect(p?.maxM).toBeGreaterThan(480);
    expect(hasRelief(p)).toBe(true);
  });

  it('ignores GPS jitter on flat water', () => {
    const jitter = Array.from({ length: 200 }, (_, i) => 406 + (i % 2 === 0 ? 2 : -2));
    const p = elevationProfile([{ mode: 'row', points: line(jitter) }]);
    expect(p?.gainM).toBe(0);
    expect(p?.lossM).toBe(0);
    expect(hasRelief(p)).toBe(false);
  });

  it('leaves plane sections out, with their distance', () => {
    const a = line([400, 410, 420]);
    const plane = line([10000, 10000], 50);
    const b = line([420, 430], 51);
    const p = elevationProfile([{ mode: 'foot', points: a }, { mode: 'plane', points: plane }, { mode: 'foot', points: b }]);
    expect(p?.points.length).toBe(5);
    expect(p?.maxM).toBeLessThan(1000);
    expect(p?.totalM).toBeLessThan(100);
  });
});

describe('coverage and terrain', () => {
  it('needs terrain when most points have no GPS height', () => {
    const s = [{ mode: 'foot' as const, points: line([400, undefined, undefined, undefined, 401]) }];
    expect(altitudeCoverage(s)).toBeCloseTo(0.4);
    expect(needsTerrain(s)).toBe(true);
    expect(needsTerrain([{ mode: 'foot', points: line([1, 2, 3, 4, 5]) }])).toBe(false);
  });

  it('samples evenly with first and last, rounded', () => {
    const s = [{ mode: 'foot' as const, points: line(new Array(1000).fill(undefined)) }];
    const samples = terrainSamples(s, 10);
    expect(samples.length).toBe(10);
    expect(samples[0].index).toBe(0);
    expect(samples[9].index).toBe(999);
    expect(samples[3].lat).toBe(Math.round(samples[3].lat * 1e5) / 1e5);
  });

  it('takes every point of a short track', () => {
    expect(terrainSamples([{ mode: 'foot', points: line([undefined, undefined, undefined]) }], 10).length).toBe(3);
  });

  it('interpolates terrain heights over the distance and clamps the ends', () => {
    const s = [{ mode: 'foot' as const, points: line(new Array(5).fill(undefined)) }];
    const samples = [{ section: 0, index: 1, lat: 0, lng: 0 }, { section: 0, index: 3, lat: 0, lng: 0 }];
    const t = terrainAltitudes(s, samples, [400, 420]);
    expect(t[0]).toEqual([400, 400, 410, 420, 420]);
  });

  it('skips samples without a height', () => {
    const s = [{ mode: 'foot' as const, points: line(new Array(3).fill(undefined)) }];
    const samples = terrainSamples(s);
    expect(terrainAltitudes(s, samples, [null, null, null])[0]).toEqual([undefined, undefined, undefined]);
  });

  it('shows terrain instead of sparse GPS heights', () => {
    const s = [{ mode: 'foot' as const, points: line([999, undefined, undefined]) }];
    const out = sectionsWithHeights(s, [[400, 401, 402]]);
    expect(out[0].points.map((p) => p.alt)).toEqual([400, 401, 402]);
    // enough GPS heights: terrain is not used
    const gps = [{ mode: 'foot' as const, points: line([1, 2, 3]) }];
    expect(sectionsWithHeights(gps, [[400, 401, 402]])).toBe(gps);
  });
});

describe('thinProfile', () => {
  it('keeps first and last', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ distM: i, altM: i, lat: 0, lng: 0, section: 0, index: i }));
    const thin = thinProfile(pts, 100);
    expect(thin.length).toBe(100);
    expect(thin[0].distM).toBe(0);
    expect(thin[99].distM).toBe(999);
  });
});

describe('buildGpx heights', () => {
  it('writes <ele> before <time> only for points with a height', () => {
    const gpx = buildGpx('x', [{ mode: 'foot', detected: false, points: line([412, undefined]) }]);
    expect(gpx).toContain('<ele>412</ele><time>');
    expect(gpx.match(/<ele>/g)?.length).toBe(1);
  });
});
