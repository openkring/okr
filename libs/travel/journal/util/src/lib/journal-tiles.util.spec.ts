import { describe, expect, it } from 'vitest';
import { limaUrl, localTileSources, offlineTilePlan, PENINSULA_BBOX, ROUTE_BBOX, tileBounds, tileRange } from './journal-tiles.util';

const count = (bbox: [number, number, number, number], z: number) => {
  const r = tileRange(bbox, z);
  return (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
};

describe('journal offline tiles', () => {
  it('tile range matches the estimate script', () => {
    // scripts/journal-tiles-estimate.mjs --bbox -72,-67,-54,-52: z8 = 308, z3 = 2
    expect(count([-72, -67, -54, -52], 8)).toBe(308);
    expect(count([-72, -67, -54, -52], 3)).toBe(2);
    expect(count([-64.5, -65.5, -56.5, -62], 10)).toBe(552);
  });

  it('tile bounds round-trip', () => {
    // Deception Island, z11 tile 679/1488 (WMS test 2026-10-24)
    const b = tileBounds(11, 679, 1488);
    expect(b.west).toBeCloseTo(-60.644531, 5);
    expect(b.east).toBeCloseTo(-60.46875, 5);
    expect(b.north).toBeCloseTo(-62.915233, 5);
    expect(b.south).toBeCloseTo(-62.995158, 5);
    const r = tileRange([b.west + 0.01, b.south + 0.01, b.east - 0.01, b.north - 0.01], 11);
    expect(r).toEqual({ x0: 679, x1: 679, y0: 1488, y1: 1488 });
  });

  it('lima url uses lat,lon axis order', () => {
    const url = new URL(limaUrl(11, 679, 1488));
    expect(url.searchParams.get('CRS')).toBe('EPSG:4326');
    expect(url.searchParams.get('VERSION')).toBe('1.3.0');
    expect(url.searchParams.get('BBOX')).toBe('-62.995158,-60.644531,-62.915233,-60.468750');
    expect(url.searchParams.get('WIDTH')).toBe('256');
  });

  it('plan contains no tile twice', () => {
    const plan = offlineTilePlan([]);
    expect(new Set(plan.map((j) => j.path)).size).toBe(plan.length);
    const route = plan.filter((j) => j.source === 'gibs');
    expect(route.every((j) => j.z >= 3 && j.z <= 8)).toBe(true);
    expect(route.length).toBe([3, 4, 5, 6, 7, 8].reduce((n, z) => n + count(ROUTE_BBOX, z), 0));
    expect(plan.filter((j) => j.source === 'lima' && j.z <= 10).length).toBe(count(PENINSULA_BBOX, 9) + count(PENINSULA_BBOX, 10));
    expect(plan.find((j) => j.source === 'gibs')?.url).toMatch(/GoogleMapsCompatible_Level8\/\d+\/\d+\/\d+\.jpg$/);
    expect(plan[0].path).toMatch(/^tiles\/(gibs|lima)\/\d+\/\d+\/\d+\.jpg$/);
  });

  it('footprints add detail around them', () => {
    const base = offlineTilePlan([]).length;
    const withSite = offlineTilePlan([{ lat: -66.5, lng: -66.0 }]); // outside the default sites
    expect(withSite.length).toBeGreaterThan(base);
    expect(withSite.some((j) => j.source === 'lima' && j.z === 12)).toBe(true);
    // a position north of the mosaic (Ushuaia) adds nothing
    expect(offlineTilePlan([{ lat: -54.8, lng: -68.3 }]).length).toBe(base);
  });

  it('local sources read the downloaded files', () => {
    const [gibs, lima] = localTileSources('capacitor://localhost/_capacitor_file_/docs/tiles');
    expect(gibs.urlTemplate).toBe('capacitor://localhost/_capacitor_file_/docs/tiles/gibs/{z}/{x}/{y}.jpg');
    expect(gibs.maxNativeZoom).toBe(8);
    expect(lima.minZoom).toBe(9);
    expect(lima.maxNativeZoom).toBe(12);
  });
});
