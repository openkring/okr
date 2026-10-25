import { describe, expect, it } from 'vitest';
import {
  ANTARCTICA_PRESET, areaTilePlan, detailLevels, estimateBytes, journalTilePlan, MapArea, mapLayers, mapPlaces, parseMapAreas, sourceFor, SUBANTARCTIC_PRESET, TILE_CAP,
  tilesToFree,
} from './journal-map-area.util';
import { LANDING_SITES, offlineTilePlan, SUBANTARCTIC_ISLANDS, SUBANTARCTIC_SITES, tileRange } from './journal-tiles.util';

const BERN: MapArea = { id: 'a1', name: 'Bern', source: 'swisstopo', bbox: [7.38, 46.92, 7.5, 46.98], maxZoom: 14 };
const OSLO: MapArea = { id: 'a2', name: 'Oslo', source: 'osm', bbox: [10.65, 59.88, 10.85, 59.96], maxZoom: 13 };

describe('journal map areas', () => {
  it('south of 60° is antarctica, Bern is swisstopo, Oslo is osm', () => {
    expect(sourceFor([-61, -63.2, -60, -62.8])).toBe('antarctica');
    expect(sourceFor(BERN.bbox)).toBe('swisstopo');
    expect(sourceFor(OSLO.bbox)).toBe('osm');
  });

  it('preset area equals the plan-6 tiles', () => {
    const points = [{ lat: -66.5, lng: -66 }];
    expect(areaTilePlan(ANTARCTICA_PRESET, points)).toEqual(offlineTilePlan(points));
  });

  it('subantarctic preset: Blue Marble for the sea, OpenStreetMap per island group to its own zoom', () => {
    const jobs = areaTilePlan(SUBANTARCTIC_PRESET, [{ lat: -66.5, lng: -66 }]); // footprints add nothing here
    expect(new Set(jobs.map((j) => j.path)).size).toBe(jobs.length);
    const gibs = jobs.filter((j) => j.source === 'gibs');
    expect(Math.min(...gibs.map((j) => j.z))).toBe(3);
    expect(Math.max(...gibs.map((j) => j.z))).toBe(8);
    const osm = jobs.filter((j) => j.source === 'osm');
    expect(osm.length + gibs.length).toBe(jobs.length);
    for (const island of SUBANTARCTIC_ISLANDS) {
      const r = tileRange(island.bbox, island.maxZoom);
      expect(osm.filter((j) => j.z === island.maxZoom && j.x >= r.x0 && j.x <= r.x1 && j.y >= r.y0 && j.y <= r.y1).length)
        .toBe((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1));
    }
    expect(Math.max(...osm.map((j) => j.z))).toBe(15); // Hummock Island at hiking detail
    expect(osm.length).toBeLessThan(2 * TILE_CAP);
  });

  it('osm jobs carry no url and a .mvt path', () => {
    const jobs = areaTilePlan(OSLO, []);
    expect(jobs.every((j) => j.source === 'osm' && j.url === '' && /^tiles\/osm\/\d+\/\d+\/\d+\.mvt$/.test(j.path))).toBe(true);
    expect(Math.min(...jobs.map((j) => j.z))).toBe(0);
    expect(Math.max(...jobs.map((j) => j.z))).toBe(13);
  });

  it('swisstopo url template', () => {
    const job = areaTilePlan(BERN, []).find((j) => j.z === 14);
    expect(job?.url).toBe(`https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/14/${job?.x}/${job?.y}.jpeg`);
    expect(job?.path).toBe(`tiles/swisstopo/14/${job?.x}/${job?.y}.jpeg`);
  });

  it('levels above the cap are not offered', () => {
    const small = detailLevels('osm', OSLO.bbox).map((l) => l.key);
    expect(small).toEqual(['overview', 'detail', 'hiking']);
    // all of Norway at hiking detail would be far above the cap
    const norway = detailLevels('osm', [4.5, 57.9, 31.2, 71.2]);
    expect(norway.map((l) => l.key)).toEqual(['overview']);
    for (const level of norway) expect(level.tiles).toBeLessThanOrEqual(TILE_CAP);
  });

  it('background is added once', () => {
    const jobs = journalTilePlan([BERN, BERN, OSLO], []);
    expect(new Set(jobs.map((j) => j.path)).size).toBe(jobs.length);
    expect(jobs.filter((j) => j.source === 'gibs' && j.z <= 4).length).toBe(1 + 4 + 16 + 64 + 256);
    expect(estimateBytes(jobs)).toBeGreaterThan(0);
  });

  it('malformed areas are dropped', () => {
    expect(parseMapAreas([BERN, { id: 'x' }, null, { ...OSLO, bbox: [1, 2, 3] }, { ...OSLO, maxZoom: 99 }, ANTARCTICA_PRESET, SUBANTARCTIC_PRESET,
      { ...SUBANTARCTIC_PRESET, preset: 'atlantis' }]))
      .toEqual([BERN, ANTARCTICA_PRESET, SUBANTARCTIC_PRESET]);
    expect(parseMapAreas('nonsense')).toEqual([]);
    // limits are checked on synced data too: too fine a zoom, too many tiles, an inverted box
    expect(parseMapAreas([{ ...OSLO, maxZoom: 17 }, { ...OSLO, bbox: [-180, -80, 180, 80], maxZoom: 12 }, { ...OSLO, bbox: [10.85, 59.88, 10.65, 59.96] }]))
      .toEqual([]);
  });

  it('layers use local files only when downloaded', () => {
    const base = 'capacitor://localhost/_capacitor_file_/d/tiles';
    const online = mapLayers([BERN, OSLO], new Set(), base);
    expect(online[0].urlTemplate).toContain('gibs.earthdata.nasa.gov'); // world background online
    expect(online.find((l) => l.urlTemplate.includes('wmts.geo.admin.ch'))?.bounds).toEqual(BERN.bbox); // swisstopo live
    expect(online.some((l) => l.kind === 'vector')).toBe(false); // OSM only from downloaded areas

    const offline = mapLayers([BERN, OSLO, ANTARCTICA_PRESET], new Set(['a1', 'a2', ANTARCTICA_PRESET.id]), base);
    expect(offline[0].urlTemplate).toBe(`${base}/gibs/{z}/{x}/{y}.jpg`);
    expect(offline.find((l) => l.kind === 'vector')).toMatchObject({ urlTemplate: `${base}/osm/{z}/{x}/{y}.mvt`, maxNativeZoom: 13, bounds: OSLO.bbox });
    expect(offline.find((l) => l.urlTemplate.endsWith('.jpeg'))?.urlTemplate).toBe(`${base}/swisstopo/{z}/{x}/{y}.jpeg`);
    expect(offline.find((l) => l.urlTemplate.endsWith('.png'))?.minZoom).toBe(9);
  });

  it('subantarctic preset draws one OpenStreetMap layer per island group, only once downloaded', () => {
    const base = 'capacitor://localhost/_capacitor_file_/d/tiles';
    expect(mapLayers([SUBANTARCTIC_PRESET], new Set(), base).some((l) => l.kind === 'vector')).toBe(false);
    const vector = mapLayers([SUBANTARCTIC_PRESET], new Set([SUBANTARCTIC_PRESET.id]), base).filter((l) => l.kind === 'vector');
    expect(vector.map((l) => [l.bounds, l.maxNativeZoom])).toEqual(SUBANTARCTIC_ISLANDS.map((i) => [i.bbox, i.maxZoom]));
  });

  it('places are the landing sites of the presets, each preset once', () => {
    expect(mapPlaces([BERN, OSLO])).toEqual([]);
    expect(mapPlaces([ANTARCTICA_PRESET, BERN, ANTARCTICA_PRESET])).toEqual(LANDING_SITES);
    expect(mapPlaces([SUBANTARCTIC_PRESET, ANTARCTICA_PRESET])).toEqual([...SUBANTARCTIC_SITES, ...LANDING_SITES]);
  });

  it('every subantarctic site lies inside the OpenStreetMap box of its island group', () => {
    const inside = (s: { lat: number; lng: number }) =>
      SUBANTARCTIC_ISLANDS.some(({ bbox: [w, so, e, n] }) => s.lng >= w && s.lng <= e && s.lat >= so && s.lat <= n);
    expect(SUBANTARCTIC_SITES.filter((s) => !inside(s)).map((s) => s.name)).toEqual([]);
  });

  it('freeing keeps what another journal still needs', () => {
    const mine = journalTilePlan([BERN, OSLO], []);
    const other = journalTilePlan([OSLO], []);
    const freed = tilesToFree(mine, other);
    expect(freed.length).toBeGreaterThan(0);
    expect(freed.every((p) => p.startsWith('tiles/swisstopo/'))).toBe(true); // Oslo and the world background stay
    expect(tilesToFree(mine, [])).toHaveLength(mine.length);
  });
});
