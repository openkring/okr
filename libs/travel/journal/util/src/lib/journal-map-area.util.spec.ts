import { describe, expect, it } from 'vitest';
import {
  ANTARCTICA_PRESET, AreaLayer, areaForWrite, areaLayerTilePlan, areaTilePlan, detailLevels, estimateBytes, journalTilePlan, layerDetailLevels, layerKindsFor, MapArea,
  mapLayers, mapPlaces, parseMapAreas, sourceFor, SUBANTARCTIC_PRESET, TILE_CAP, tilesToFree,
} from './journal-map-area.util';
import { Bbox, LANDING_SITES, offlineTilePlan, SUBANTARCTIC_BBOX, SUBANTARCTIC_ISLANDS, SUBANTARCTIC_SITES, tileRange } from './journal-tiles.util';

const BERN: MapArea = { id: 'a1', name: 'Bern', source: 'swisstopo', bbox: [7.38, 46.92, 7.5, 46.98], maxZoom: 14, layers: [{ kind: 'swisstopo', maxZoom: 14 }] };
const OSLO: MapArea = { id: 'a2', name: 'Oslo', source: 'osm', bbox: [10.65, 59.88, 10.85, 59.96], maxZoom: 13, layers: [{ kind: 'osm', maxZoom: 13 }] };
const DECEPTION: Bbox = [-61, -63.2, -60, -62.8];

/** An area as a phase 3 build wrote it: no `layers`. */
function legacy(area: MapArea): Record<string, unknown> {
  const { layers: _layers, ...rest } = area;
  return rest;
}

/**
 * Frozen copy of the phase 3 parser (`isArea` + `withinLimits` at commit bf0b364ed): an iPad still on a phase 3
 * build must keep every area a phase 4 build writes. Do not update this to the current parser.
 */
function phase3Accepts(value: unknown): boolean {
  const SOURCES = ['antarctica', 'swisstopo', 'osm'];
  const PRESETS = ['antarctica-expedition', 'subantarctic-islands'];
  const LEVELS: Record<string, { maxZoom: number }[]> = {
    antarctica: [{ maxZoom: 10 }, { maxZoom: 12 }],
    swisstopo: [{ maxZoom: 11 }, { maxZoom: 14 }, { maxZoom: 16 }],
    osm: [{ maxZoom: 10 }, { maxZoom: 13 }, { maxZoom: 15 }],
  };
  const minZoomOf = (source: string) => (source === 'swisstopo' ? 6 : source === 'antarctica' ? 3 : 0);
  const countTiles = (bbox: Bbox, zMin: number, zMax: number) => {
    let n = 0;
    for (let z = zMin; z <= zMax; z++) {
      const r = tileRange(bbox, z);
      n += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    }
    return n;
  };
  const isArea = (v: unknown): boolean => {
    if (typeof v !== 'object' || v === null) return false;
    const a = v as Record<string, unknown>;
    const bbox = a['bbox'];
    return typeof a['id'] === 'string' && a['id'] !== '' && typeof a['name'] === 'string'
      && SOURCES.includes(a['source'] as string)
      && Array.isArray(bbox) && bbox.length === 4 && bbox.every((x) => typeof x === 'number' && Number.isFinite(x))
      && typeof a['maxZoom'] === 'number' && Number.isInteger(a['maxZoom']) && (a['maxZoom'] as number) >= 0 && (a['maxZoom'] as number) <= 18
      && (a['preset'] === undefined || PRESETS.includes(a['preset'] as string));
  };
  const withinLimits = (area: { source: string; bbox: Bbox; maxZoom: number; preset?: string }): boolean => {
    if (area.preset !== undefined) return true;
    const finest = Math.max(...LEVELS[area.source].map((l) => l.maxZoom));
    const [w, s, e, n] = area.bbox;
    if (area.maxZoom > finest || w >= e || s >= n) return false;
    return countTiles(area.bbox, minZoomOf(area.source), area.maxZoom) <= TILE_CAP;
  };
  return isArea(value) && withinLimits(value as { source: string; bbox: Bbox; maxZoom: number; preset?: string });
}

/** Tile paths of one source over a box and zoom range, as phase 3 planned them. */
function paths(source: string, ext: string, bbox: Bbox, zMin: number, zMax: number): string[] {
  const out: string[] = [];
  for (let z = zMin; z <= zMax; z++) {
    const r = tileRange(bbox, z);
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) out.push(`tiles/${source}/${z}/${x}/${y}.${ext}`);
  }
  return out;
}

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

  describe('layers (phase 4)', () => {
    it('legacy areas derive layers', () => {
      const ant = { id: 'd', name: 'Deception', source: 'antarctica', bbox: DECEPTION, maxZoom: 12 };
      expect(parseMapAreas([ant])[0].layers).toEqual([{ kind: 'satellite', maxZoom: 12 }]);
      expect(parseMapAreas([legacy(OSLO)])[0].layers).toEqual([{ kind: 'osm', maxZoom: 13 }]);
      expect(parseMapAreas([legacy(BERN)])[0].layers).toEqual([{ kind: 'swisstopo', maxZoom: 14 }]);
      expect(parseMapAreas([legacy(SUBANTARCTIC_PRESET)])[0].layers).toEqual([{ kind: 'satellite', maxZoom: 8 }, { kind: 'osm', maxZoom: 13 }]);
      expect(parseMapAreas([legacy(ANTARCTICA_PRESET)])[0].layers).toEqual([{ kind: 'satellite', maxZoom: 12 }]);
      expect(SUBANTARCTIC_PRESET.layers).toEqual([{ kind: 'satellite', maxZoom: 8 }, { kind: 'osm', maxZoom: 13 }]);
    });

    it('layers survive a round trip', () => {
      const areas: MapArea[] = [
        BERN, OSLO, ANTARCTICA_PRESET, SUBANTARCTIC_PRESET,
        { id: 'b', name: 'Biscay', source: 'osm', bbox: [-10, 40, 0, 45], maxZoom: 10, layers: [{ kind: 'satellite', maxZoom: 8 }] },
        { id: 'd', name: 'Deception', source: 'antarctica', bbox: DECEPTION, maxZoom: 12, layers: [{ kind: 'osm', maxZoom: 13 }, { kind: 'satellite', maxZoom: 12 }] },
      ];
      for (const a of areas) expect(parseMapAreas([areaForWrite(a)])[0].layers).toEqual(a.layers);
    });

    it('writes keep a phase-3-valid source and maxZoom', () => {
      const satellite: MapArea = { id: 'b', name: 'Biscay', source: 'osm', bbox: [-10, 40, 0, 45], maxZoom: 8, layers: [{ kind: 'satellite', maxZoom: 8 }] };
      expect(areaForWrite(satellite)).toMatchObject({ source: 'osm', maxZoom: 10 }); // the region's lowest level
      const ant: MapArea = { id: 'd', name: 'D', source: 'antarctica', bbox: DECEPTION, maxZoom: 10, layers: [{ kind: 'osm', maxZoom: 13 }, { kind: 'satellite', maxZoom: 12 }] };
      expect(areaForWrite(ant)).toMatchObject({ source: 'antarctica', maxZoom: 12 }); // the region source's layer
      expect(areaForWrite(ANTARCTICA_PRESET)).toMatchObject({ source: 'antarctica', maxZoom: 12, preset: 'antarctica-expedition' });
      expect('preset' in areaForWrite(BERN)).toBe(false);
      // a satellite area far larger than an OpenStreetMap overview allows: maxZoom lowered so phase 3 still keeps it
      const europe: MapArea = { id: 'e', name: 'Europa', source: 'osm', bbox: [-25, 34, 45, 71], maxZoom: 6, layers: [{ kind: 'satellite', maxZoom: 6 }] };
      const written = areaForWrite(europe);
      expect(written['maxZoom']).toBeLessThan(10);
      expect(phase3Accepts(written)).toBe(true);
      expect(parseMapAreas([written])[0].layers).toEqual(europe.layers);
    });

    it('phase-3 parser keeps an area written by phase 4', () => {
      expect(phase3Accepts(areaForWrite({ id: 'b', name: 'Biscay', source: 'osm', bbox: [-10, 40, 0, 45], maxZoom: 8, layers: [{ kind: 'satellite', maxZoom: 8 }] })))
        .toBe(true);
      expect(phase3Accepts(areaForWrite({ id: 'd', name: 'D', source: 'antarctica', bbox: DECEPTION, maxZoom: 12,
        layers: [{ kind: 'osm', maxZoom: 13 }, { kind: 'satellite', maxZoom: 12 }] }))).toBe(true);
      for (const a of [BERN, OSLO, ANTARCTICA_PRESET, SUBANTARCTIC_PRESET]) expect(phase3Accepts(areaForWrite(a))).toBe(true);
    });

    it('layer maxZoom above the kind\'s levels is dropped', () => {
      expect(parseMapAreas([{ ...OSLO, layers: [{ kind: 'osm', maxZoom: 16 }] }])).toEqual([]);
      expect(parseMapAreas([{ ...OSLO, layers: [{ kind: 'osm', maxZoom: 13 }, { kind: 'satellite', maxZoom: 12 }] }])[0].layers) // GIBS stops at 8 here
        .toEqual([{ kind: 'osm', maxZoom: 13 }]);
      expect(parseMapAreas([{ ...OSLO, layers: [{ kind: 'osm', maxZoom: 13 }, { kind: 'osm', maxZoom: 10 }, { kind: 'lidar', maxZoom: 3 }, null] }])[0].layers)
        .toEqual([{ kind: 'osm', maxZoom: 13 }]);
      expect(parseMapAreas([{ ...OSLO, layers: [] }])).toEqual([]);
      expect(parseMapAreas([{ ...OSLO, layers: 'osm' }])).toEqual([]);
      // the tile cap holds per layer: all of Norway at hiking detail
      expect(parseMapAreas([{ ...OSLO, bbox: [4.5, 57.9, 31.2, 71.2], layers: [{ kind: 'osm', maxZoom: 15 }] }])).toEqual([]);
    });

    it('swisstopo outside Switzerland is not offered', () => {
      expect(layerKindsFor([-10, 40, 0, 45])).toEqual(['satellite', 'osm']);
      expect(layerKindsFor(BERN.bbox)).toEqual(['satellite', 'osm', 'swisstopo']);
      expect(layerDetailLevels('swisstopo', [-10, 40, 0, 45])).toEqual([]);
      expect(parseMapAreas([{ ...OSLO, layers: [{ kind: 'swisstopo', maxZoom: 11 }] }])).toEqual([]);
    });

    it('satellite levels: GIBS up to 8, LIMA detail only south of 60° S', () => {
      expect(layerDetailLevels('satellite', [-10, 40, 0, 45]).map((l) => [l.key, l.maxZoom])).toEqual([['overview', 8]]);
      expect(layerDetailLevels('satellite', DECEPTION).map((l) => [l.key, l.maxZoom])).toEqual([['overview', 10], ['detail', 12]]);
      expect(layerDetailLevels('osm', OSLO.bbox)).toEqual(detailLevels('osm', OSLO.bbox));
      expect(layerDetailLevels('swisstopo', BERN.bbox)).toEqual(detailLevels('swisstopo', BERN.bbox));
    });

    it('per-layer plan equals today\'s plan for legacy areas', () => {
      const points = [{ lat: -66.5, lng: -66 }];
      const union = (a: MapArea) => new Set(a.layers.flatMap((l) => areaLayerTilePlan(a, l, points)).map((j) => j.path));
      expect(union(ANTARCTICA_PRESET)).toEqual(new Set(offlineTilePlan(points).map((j) => j.path)));
      expect(union(SUBANTARCTIC_PRESET)).toEqual(new Set([
        ...paths('gibs', 'jpg', SUBANTARCTIC_BBOX, 3, 8), ...SUBANTARCTIC_ISLANDS.flatMap((i) => paths('osm', 'mvt', i.bbox, 0, i.maxZoom)),
      ]));
      expect(union(BERN)).toEqual(new Set(paths('swisstopo', 'jpeg', BERN.bbox, 6, 14)));
      expect(union(OSLO)).toEqual(new Set(paths('osm', 'mvt', OSLO.bbox, 0, 13)));
      const ant = parseMapAreas([{ id: 'd', name: 'D', source: 'antarctica', bbox: DECEPTION, maxZoom: 12 }])[0];
      expect(union(ant)).toEqual(new Set([...paths('gibs', 'jpg', DECEPTION, 3, 8), ...paths('lima', 'png', DECEPTION, 9, 12)]));
      for (const a of [ANTARCTICA_PRESET, SUBANTARCTIC_PRESET, BERN, OSLO, ant]) {
        expect(new Set(areaTilePlan(a, points).map((j) => j.path))).toEqual(union(a));
      }
    });

    it('a satellite layer outside Antarctica plans GIBS only', () => {
      const layer: AreaLayer = { kind: 'satellite', maxZoom: 8 };
      const area: MapArea = { id: 'b', name: 'B', source: 'osm', bbox: [-10, 40, 0, 45], maxZoom: 10, layers: [layer] };
      expect(new Set(areaLayerTilePlan(area, layer, []).map((j) => j.path))).toEqual(new Set(paths('gibs', 'jpg', area.bbox, 3, 8)));
    });
  });
});
