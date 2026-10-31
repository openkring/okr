import { describe, expect, it } from 'vitest';
import { BaseLayerInput, baseLayerOptions, pickBaseLayer } from './journal-base-layer.util';
import { MapArea, SUBANTARCTIC_PRESET } from './journal-map-area.util';
import { GIBS_BLUE_MARBLE } from './journal-map.util';
import { Bbox, SUBANTARCTIC_ISLANDS } from './journal-tiles.util';

const BASE = 'https://localhost/_capacitor_file_/tiles';
const GOOGLE = { roadmap: 'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=r&key=k', satellite: 'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=s&key=k' };
const BERN_VIEW: Bbox = [7.3, 46.9, 7.6, 47.0];
const OSLO_VIEW: Bbox = [10.5, 59.8, 11.0, 60.0];

const OSLO: MapArea = { id: 'oslo', name: 'Oslo', source: 'osm', bbox: [10.65, 59.88, 10.85, 59.96], maxZoom: 13,
  layers: [{ kind: 'osm', maxZoom: 13 }, { kind: 'satellite', maxZoom: 8 }] };
const BAERUM: MapArea = { id: 'baerum', name: 'Bærum', source: 'osm', bbox: [10.45, 59.85, 10.64, 59.95], maxZoom: 13,
  layers: [{ kind: 'osm', maxZoom: 13 }] };
const BERN: MapArea = { id: 'bern', name: 'Bern', source: 'swisstopo', bbox: [7.38, 46.92, 7.5, 46.98], maxZoom: 14,
  layers: [{ kind: 'swisstopo', maxZoom: 14 }] };

function input(patch: Partial<BaseLayerInput>): BaseLayerInput {
  return { online: true, google: GOOGLE, areas: [], usable: new Set(), view: OSLO_VIEW, tilesBaseUrl: BASE, ...patch };
}

describe('baseLayerOptions', () => {
  it('online with sessions offers google first, then live swisstopo in Switzerland, then world', () => {
    const options = baseLayerOptions(input({ view: BERN_VIEW }));
    expect(options.map((o) => o.id)).toEqual(['google-roadmap', 'google-satellite', 'swisstopo-live', 'world']);
    expect(options[0]).toMatchObject({ kind: 'google', googleType: 'roadmap' });
    expect(options[0].sources).toHaveLength(1); // Google draws alone
    expect(options[0].sources[0].urlTemplate).toBe(GOOGLE.roadmap);
    expect(options[1]).toMatchObject({ kind: 'google', googleType: 'satellite' });
    expect(options[2].kind).toBe('live');
    expect(options[2].sources.some((s) => s.urlTemplate.includes('wmts.geo.admin.ch'))).toBe(true);
    expect(options[3]).toMatchObject({ kind: 'background', sources: [GIBS_BLUE_MARBLE] });
  });

  it('outside Switzerland there is no live swisstopo', () => {
    expect(baseLayerOptions(input({ view: OSLO_VIEW })).map((o) => o.id)).toEqual(['google-roadmap', 'google-satellite', 'world']);
  });

  it('no session: no google options', () => {
    expect(baseLayerOptions(input({ google: {} })).map((o) => o.id)).toEqual(['world']);
    expect(baseLayerOptions(input({ google: { satellite: GOOGLE.satellite } })).map((o) => o.id)).toEqual(['google-satellite', 'world']);
  });

  it('offline drops google and live swisstopo; the world map reads the local background', () => {
    const options = baseLayerOptions(input({ online: false, view: BERN_VIEW }));
    expect(options.map((o) => o.id)).toEqual(['world']);
    expect(options[0].sources).toEqual([{ urlTemplate: `${BASE}/gibs/{z}/{x}/{y}.jpg`, maxNativeZoom: 4, attribution: 'Imagery: NASA GIBS' }]);
  });

  it('offline osm draws satellite underneath', () => {
    const options = baseLayerOptions(input({ areas: [OSLO], usable: new Set(['oslo:osm', 'oslo:satellite']) }));
    const osm = options.find((o) => o.id === 'offline-osm');
    expect(osm?.kind).toBe('offline');
    const sources = osm?.sources ?? [];
    const firstVector = sources.findIndex((s) => s.kind === 'vector');
    const satellite = sources.findIndex((s) => s.kind !== 'vector' && s.bounds !== undefined && s.urlTemplate.includes('/gibs/'));
    expect(sources[0]).toMatchObject({ urlTemplate: `${BASE}/gibs/{z}/{x}/{y}.jpg`, maxNativeZoom: 4 }); // world background
    expect(sources[0].bounds).toBeUndefined();
    expect(satellite).toBeGreaterThan(0);
    expect(firstVector).toBeGreaterThan(satellite);
    expect(sources[satellite]).toMatchObject({ bounds: OSLO.bbox, maxNativeZoom: 8 });
    expect(sources[firstVector]).toMatchObject({ urlTemplate: `${BASE}/osm/{z}/{x}/{y}.mvt`, bounds: OSLO.bbox, maxNativeZoom: 13 });
  });

  it('offline osm without a downloaded satellite layer sits on the background alone', () => {
    const osm = baseLayerOptions(input({ areas: [OSLO], usable: new Set(['oslo:osm']) })).find((o) => o.id === 'offline-osm');
    expect(osm?.sources.map((s) => s.kind ?? 'raster')).toEqual(['raster', 'vector']);
  });

  it('an offline option draws every usable area of its kind', () => {
    const options = baseLayerOptions(input({ areas: [OSLO, BAERUM], usable: new Set(['oslo:osm', 'baerum:osm']) }));
    const vectors = options.find((o) => o.id === 'offline-osm')?.sources.filter((s) => s.kind === 'vector') ?? [];
    expect(vectors.map((s) => s.bounds)).toEqual([OSLO.bbox, BAERUM.bbox]);
  });

  it('an offline option draws areas outside the view too, once one of them is in view', () => {
    const elsewhere: MapArea = { ...BAERUM, id: 'far', bbox: [20, 60, 20.2, 60.1] };
    const options = baseLayerOptions(input({ areas: [OSLO, elsewhere], usable: new Set(['oslo:osm', 'far:osm']) }));
    expect(options.find((o) => o.id === 'offline-osm')?.sources.filter((s) => s.kind === 'vector')).toHaveLength(2);
  });

  it('the subantarctic preset draws one vector source per island group', () => {
    const options = baseLayerOptions(input({ areas: [SUBANTARCTIC_PRESET], view: [-62, -60, -25, -50],
      usable: new Set([`${SUBANTARCTIC_PRESET.id}:osm`, `${SUBANTARCTIC_PRESET.id}:satellite`]) }));
    const vectors = options.find((o) => o.id === 'offline-osm')?.sources.filter((s) => s.kind === 'vector') ?? [];
    expect(vectors.map((s) => s.bounds)).toEqual(SUBANTARCTIC_ISLANDS.map((i) => i.bbox));
  });

  it('offline satellite and swisstopo draw the local tiles of their areas over the background', () => {
    const swiss = baseLayerOptions(input({ online: false, view: BERN_VIEW, areas: [BERN], usable: new Set(['bern:swisstopo']) }));
    expect(swiss.map((o) => o.id)).toEqual(['offline-swisstopo', 'world']);
    expect(swiss[0].sources[1]).toMatchObject({ urlTemplate: `${BASE}/swisstopo/{z}/{x}/{y}.jpeg`, bounds: BERN.bbox, maxNativeZoom: 14, minZoom: 6 });

    const antarctic: MapArea = { id: 'dec', name: 'Deception', source: 'antarctica', bbox: [-61, -63.2, -60, -62.8], maxZoom: 12,
      layers: [{ kind: 'satellite', maxZoom: 12 }] };
    const sat = baseLayerOptions(input({ online: false, view: antarctic.bbox, areas: [antarctic], usable: new Set(['dec:satellite']) }));
    expect(sat[0].id).toBe('offline-satellite');
    expect(sat[0].sources.map((s) => s.urlTemplate)).toEqual([
      `${BASE}/gibs/{z}/{x}/{y}.jpg`, `${BASE}/gibs/{z}/{x}/{y}.jpg`, `${BASE}/lima/{z}/{x}/{y}.png`,
    ]);
    expect(sat[0].sources[2]).toMatchObject({ bounds: antarctic.bbox, minZoom: 9, maxNativeZoom: 12 });
  });

  it('unusable areas are not offered', () => {
    const options = baseLayerOptions(input({ areas: [OSLO, BERN], usable: new Set(['oslo:satellite', 'bern:swisstopo']) }));
    expect(options.map((o) => o.id)).toEqual(['google-roadmap', 'google-satellite', 'offline-satellite', 'world']);
  });

  it('areas out of view are not offered', () => {
    const options = baseLayerOptions(input({ view: BERN_VIEW, areas: [OSLO], usable: new Set(['oslo:osm']) }));
    expect(options.some((o) => o.kind === 'offline')).toBe(false);
  });
});

describe('pickBaseLayer', () => {
  it('a stored id still offered is kept', () => {
    const options = baseLayerOptions(input({ view: BERN_VIEW }));
    expect(pickBaseLayer(options, 'swisstopo-live')).toBe('swisstopo-live');
    expect(pickBaseLayer(options, 'world')).toBe('world');
  });

  it('without a stored choice the first google option wins', () => {
    expect(pickBaseLayer(baseLayerOptions(input({})), undefined)).toBe('google-roadmap');
    expect(pickBaseLayer(baseLayerOptions(input({})), 'offline-osm')).toBe('google-roadmap');
  });

  it('offline drops google and picks the first offline option in view', () => {
    const inView = baseLayerOptions(input({ online: false, areas: [OSLO], usable: new Set(['oslo:satellite']) }));
    expect(pickBaseLayer(inView, 'google-satellite')).toBe('offline-satellite');
    const outOfView = baseLayerOptions(input({ online: false, view: BERN_VIEW, areas: [OSLO], usable: new Set(['oslo:satellite']) }));
    expect(pickBaseLayer(outOfView, 'google-satellite')).toBe('world');
  });
});
