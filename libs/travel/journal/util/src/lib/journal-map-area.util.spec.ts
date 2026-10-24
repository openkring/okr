import { describe, expect, it } from 'vitest';
import {
  ANTARCTICA_PRESET, areaTilePlan, detailLevels, estimateBytes, journalTilePlan, MapArea, mapLayers, parseMapAreas, sourceFor, TILE_CAP,
} from './journal-map-area.util';
import { offlineTilePlan } from './journal-tiles.util';

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
    expect(parseMapAreas([BERN, { id: 'x' }, null, { ...OSLO, bbox: [1, 2, 3] }, { ...OSLO, maxZoom: 99 }, ANTARCTICA_PRESET]))
      .toEqual([BERN, ANTARCTICA_PRESET]);
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
});
