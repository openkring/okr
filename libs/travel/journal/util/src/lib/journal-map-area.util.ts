import { GIBS_BLUE_MARBLE, JournalTileSource } from './journal-map.util';
import {
  Bbox, LANDING_SITES, limaUrl, offlineTilePlan, ROUTE_BBOX, SUBANTARCTIC_BBOX, SUBANTARCTIC_ISLANDS, SUBANTARCTIC_SITES, TileJob, tileRange,
} from './journal-tiles.util';

/**
 * Map areas of a journal (spec 1.113 §9.4, plan 6b): what the offline map covers, per journal. The source
 * follows the region — Antarctica (GIBS + LIMA, plan 6), Switzerland (swisstopo), anywhere else
 * OpenStreetMap vector tiles from the Protomaps planet build. Areas are the journal field `mapAreas` in
 * the change log, so both iPads have them.
 */
export type MapSource = 'antarctica' | 'swisstopo' | 'osm';
export type DetailLevel = 'overview' | 'detail' | 'hiking';
export type MapPreset = 'antarctica-expedition' | 'subantarctic-islands';
const PRESETS: MapPreset[] = ['antarctica-expedition', 'subantarctic-islands'];

/** A map layer an area can be downloaded for (phase 4, design §3); each layer has its own detail level. */
export type MapLayerKind = 'osm' | 'satellite' | 'swisstopo';
export interface AreaLayer { kind: MapLayerKind; maxZoom: number }
const LAYER_KINDS: MapLayerKind[] = ['satellite', 'osm', 'swisstopo'];

/**
 * `source` and `maxZoom` are what a phase 3 build reads; phase 4 reads `layers` (always filled after
 * `parseMapAreas`, derived from `source` for areas written before phase 4).
 */
export interface MapArea {
  id: string;
  name: string;
  source: MapSource;
  bbox: Bbox;
  maxZoom: number;
  preset?: MapPreset;
  layers: AreaLayer[];
}

/** A named point on the map (a landing site), drawn small and without a photo. */
export interface MapPlace { name: string; lat: number; lng: number }

const PRESET_PLACES: Record<MapPreset, MapPlace[]> = {
  'antarctica-expedition': LANDING_SITES,
  'subantarctic-islands': SUBANTARCTIC_SITES,
};

/** The landing sites of the journal's presets, each preset once. */
export function mapPlaces(areas: MapArea[]): MapPlace[] {
  const presets = new Set(areas.map((a) => a.preset).filter((p): p is MapPreset => p !== undefined));
  return [...presets].flatMap((p) => PRESET_PLACES[p]);
}

/** At most this many tiles per area: the action sheet offers only levels below it. */
export const TILE_CAP = 20_000;

/** Plan 6 as an area: route, peninsula and landing sites (plus the journal's footprints). */
export const ANTARCTICA_PRESET: MapArea = {
  id: 'antarctica-expedition', name: 'Antarktis-Expedition', source: 'antarctica', bbox: ROUTE_BBOX, maxZoom: 12, preset: 'antarctica-expedition',
  layers: [{ kind: 'satellite', maxZoom: 12 }],
};

/** Falklands, South Georgia and the South Sandwich Islands: Blue Marble for the sea, OpenStreetMap per island group. */
export const SUBANTARCTIC_PRESET: MapArea = {
  id: 'subantarctic-islands', name: 'Falkland, Südgeorgien, Süd-Sandwich', source: 'osm', bbox: SUBANTARCTIC_BBOX, maxZoom: 13,
  preset: 'subantarctic-islands', layers: [{ kind: 'satellite', maxZoom: 8 }, { kind: 'osm', maxZoom: 13 }],
};

/** The box `sourceFor` and `layerKindsFor` test a bbox's centre against. */
export const SWITZERLAND: Bbox = [5.9, 45.8, 10.5, 47.85];
const SWISSTOPO_TEMPLATE = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
const SWISSTOPO_MIN_ZOOM = 6;
const GIBS_TEMPLATE = GIBS_BLUE_MARBLE.urlTemplate;
const BACKGROUND_ZOOMS = [0, 1, 2, 3, 4];
const WORLD: Bbox = [-180, -85, 180, 85];

const LEVELS: Record<MapSource, { key: DetailLevel; maxZoom: number }[]> = {
  antarctica: [{ key: 'overview', maxZoom: 10 }, { key: 'detail', maxZoom: 12 }],
  swisstopo: [{ key: 'overview', maxZoom: 11 }, { key: 'detail', maxZoom: 14 }, { key: 'hiking', maxZoom: 16 }],
  osm: [{ key: 'overview', maxZoom: 10 }, { key: 'detail', maxZoom: 13 }, { key: 'hiking', maxZoom: 15 }],
};

/** Average stored tile size per source, for the size shown before a download. */
const AVERAGE_BYTES: Record<TileJob['source'], number> = { gibs: 20_000, lima: 58_000, swisstopo: 35_000, osm: 60_000 }; // osm: uncompressed MVT, 65–145 KB in a city (Oslo, 2026-10-24)

const centre = ([w, s, e, n]: Bbox) => ({ lat: (s + n) / 2, lng: (w + e) / 2 });
const inside = (p: { lat: number; lng: number }, [w, s, e, n]: Bbox) => p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n;

export function sourceFor(bbox: Bbox): MapSource {
  const c = centre(bbox);
  if (c.lat < -60) return 'antarctica';
  if (inside(c, SWITZERLAND)) return 'swisstopo';
  return 'osm';
}

function minZoomOf(source: MapSource): number {
  return source === 'swisstopo' ? SWISSTOPO_MIN_ZOOM : source === 'antarctica' ? 3 : 0;
}

function countTiles(bbox: Bbox, zMin: number, zMax: number): number {
  let n = 0;
  for (let z = zMin; z <= zMax; z++) {
    const r = tileRange(bbox, z);
    n += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  }
  return n;
}

/** The detail levels an area may take, each with its tile count; only those within TILE_CAP. */
export function detailLevels(source: MapSource, bbox: Bbox): { key: DetailLevel; maxZoom: number; tiles: number }[] {
  return LEVELS[source]
    .map((level) => ({ ...level, tiles: countTiles(bbox, minZoomOf(source), level.maxZoom) }))
    .filter((level) => level.tiles <= TILE_CAP);
}

/** LIMA (the satellite detail beyond GIBS z8) covers Antarctica only: the same region rule as `sourceFor`. */
const isAntarctic = (bbox: Bbox): boolean => sourceFor(bbox) === 'antarctica';
const GIBS_MAX_ZOOM = 8;
const LIMA_MAX_ZOOM = 12;

/** Layers valid for a bbox: satellite and osm everywhere, swisstopo only when the bbox lies in Switzerland. */
export function layerKindsFor(bbox: Bbox): MapLayerKind[] {
  return LAYER_KINDS.filter((kind) => kind !== 'swisstopo' || inside(centre(bbox), SWITZERLAND));
}

/** The levels of a layer kind regardless of the tile cap; satellite is GIBS up to z8, with LIMA z10/z12 in Antarctica. */
function layerLevels(kind: MapLayerKind, bbox: Bbox): { key: DetailLevel; maxZoom: number }[] {
  if (kind === 'satellite') return isAntarctic(bbox) ? LEVELS.antarctica : [{ key: 'overview', maxZoom: GIBS_MAX_ZOOM }];
  return LEVELS[kind];
}

function layerMinZoom(kind: MapLayerKind): number {
  return kind === 'satellite' ? minZoomOf('antarctica') : minZoomOf(kind);
}

/** Detail levels of one layer kind for a bbox (like detailLevels, per kind; satellite = GIBS ≤ 8, LIMA 10/12 south of 60° S). */
export function layerDetailLevels(kind: MapLayerKind, bbox: Bbox): { key: DetailLevel; maxZoom: number; tiles: number }[] {
  if (!layerKindsFor(bbox).includes(kind)) return [];
  return layerLevels(kind, bbox)
    .map((level) => ({ ...level, tiles: countTiles(bbox, layerMinZoom(kind), level.maxZoom) }))
    .filter((level) => level.tiles <= TILE_CAP);
}

/** The layer kind that draws a phase 3 source. */
const KIND_OF_SOURCE: Record<MapSource, MapLayerKind> = { antarctica: 'satellite', swisstopo: 'swisstopo', osm: 'osm' };

/** The layer kinds a phase 3 download of the area fetched: its `source`'s kind, plus satellite (GIBS) for the subantarctic preset. */
export function phase3LayerKinds(area: { source: MapSource; preset?: MapPreset }): MapLayerKind[] {
  return area.preset === 'subantarctic-islands' ? ['satellite', 'osm'] : [KIND_OF_SOURCE[area.source]];
}

/** The layers of an area written before phase 4, from its `source` (the subantarctic preset downloads GIBS + OSM). */
function derivedLayers(area: { source: MapSource; maxZoom: number; preset?: MapPreset }): AreaLayer[] {
  if (area.preset === 'subantarctic-islands') return [{ kind: 'satellite', maxZoom: GIBS_MAX_ZOOM }, { kind: 'osm', maxZoom: area.maxZoom }];
  return [{ kind: KIND_OF_SOURCE[area.source], maxZoom: area.maxZoom }];
}

/**
 * The phase 3 `maxZoom` of an area without a layer of its region's source: the source's lowest level, lowered until the
 * phase 3 tile cap holds (a satellite area may be far larger than an OpenStreetMap overview allows).
 */
function fallbackMaxZoom(source: MapSource, bbox: Bbox): number {
  let z = LEVELS[source][0].maxZoom;
  while (z > 0 && countTiles(bbox, minZoomOf(source), z) > TILE_CAP) z--;
  return z;
}

/**
 * The record stored in `mapAreas`: layers plus a phase-3-valid `source`/`maxZoom` (source = sourceFor(bbox); maxZoom = that
 * source's layer maxZoom, else the source's lowest level, lowered to the tile cap). A preset keeps its own source, which its
 * fixed phase 3 plan and layers depend on (the Antarctica route box is centred north of 60° S).
 */
export function areaForWrite(area: MapArea): Record<string, unknown> {
  const source = area.preset !== undefined ? area.source : sourceFor(area.bbox);
  const own = area.layers.find((l) => l.kind === KIND_OF_SOURCE[source]);
  const record: Record<string, unknown> = {
    id: area.id, name: area.name, source, bbox: area.bbox, maxZoom: own?.maxZoom ?? fallbackMaxZoom(source, area.bbox),
    layers: area.layers.map((l) => ({ kind: l.kind, maxZoom: l.maxZoom })),
  };
  if (area.preset !== undefined) record['preset'] = area.preset;
  return record;
}

function jobsFor(source: TileJob['source'], bbox: Bbox, zMin: number, zMax: number): TileJob[] {
  const jobs: TileJob[] = [];
  for (let z = zMin; z <= zMax; z++) {
    const r = tileRange(bbox, z);
    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = r.y0; y <= r.y1; y++) {
        switch (source) {
          case 'gibs':
            jobs.push({ source, z, x, y, path: `tiles/gibs/${z}/${x}/${y}.jpg`,
              url: GIBS_TEMPLATE.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x)) });
            break;
          case 'lima':
            jobs.push({ source, z, x, y, path: `tiles/lima/${z}/${x}/${y}.png`, url: limaUrl(z, x, y) });
            break;
          case 'swisstopo':
            jobs.push({ source, z, x, y, path: `tiles/swisstopo/${z}/${x}/${y}.jpeg`,
              url: SWISSTOPO_TEMPLATE.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)) });
            break;
          case 'osm':
            jobs.push({ source, z, x, y, path: `tiles/osm/${z}/${x}/${y}.mvt`, url: '' }); // read from the Protomaps build
            break;
        }
      }
    }
  }
  return jobs;
}

/** The layer kinds a preset's fixed plan has; any other kind on a preset is dropped and plans nothing. */
const PRESET_KINDS: Record<MapPreset, MapLayerKind[]> = {
  'antarctica-expedition': ['satellite'],
  'subantarctic-islands': ['satellite', 'osm'],
};

const unique = (jobs: TileJob[]): TileJob[] => [...new Map(jobs.map((j) => [j.path, j])).values()];

/** Tile jobs of ONE layer of an area (the per-journal footprints feed the Antarctica satellite detail as today). */
export function areaLayerTilePlan(area: MapArea, layer: AreaLayer, footprints: { lat: number; lng: number }[]): TileJob[] {
  if (area.preset === 'antarctica-expedition') return layer.kind === 'satellite' ? offlineTilePlan(footprints) : [];
  if (area.preset === 'subantarctic-islands') {
    if (layer.kind === 'satellite') return jobsFor('gibs', SUBANTARCTIC_BBOX, 3, Math.min(GIBS_MAX_ZOOM, layer.maxZoom));
    if (layer.kind === 'osm') return unique(SUBANTARCTIC_ISLANDS.flatMap((i) => jobsFor('osm', i.bbox, 0, i.maxZoom))); // shared low-zoom tiles
    return []; // a preset never falls through to a plan over its (large) box
  }
  switch (layer.kind) {
    case 'satellite':
      return [
        ...jobsFor('gibs', area.bbox, 3, Math.min(GIBS_MAX_ZOOM, layer.maxZoom)),
        ...(isAntarctic(area.bbox) ? jobsFor('lima', area.bbox, 9, Math.min(LIMA_MAX_ZOOM, layer.maxZoom)) : []),
      ];
    case 'swisstopo':
      return jobsFor('swisstopo', area.bbox, SWISSTOPO_MIN_ZOOM, layer.maxZoom);
    case 'osm':
      return jobsFor('osm', area.bbox, 0, layer.maxZoom);
  }
}

/** Every tile of an area: the union of its layers' plans, each path once. */
export function areaTilePlan(area: MapArea, footprints: { lat: number; lng: number }[]): TileJob[] {
  return unique(area.layers.flatMap((layer) => areaLayerTilePlan(area, layer, footprints)));
}

/** Every tile of the journal's areas plus the world background (GIBS z0–4), each once. */
export function journalTilePlan(areas: MapArea[], footprints: { lat: number; lng: number }[]): TileJob[] {
  const jobs = new Map<string, TileJob>();
  for (const job of [...jobsFor('gibs', WORLD, BACKGROUND_ZOOMS[0], BACKGROUND_ZOOMS[BACKGROUND_ZOOMS.length - 1]),
    ...areas.flatMap((a) => areaTilePlan(a, footprints))]) {
    if (!jobs.has(job.path)) jobs.set(job.path, job);
  }
  return [...jobs.values()];
}

/**
 * The tiles a journal's map may delete (plan 8): its own plan minus everything another journal on this iPad still
 * needs — tiles are shared on disk (one file per source and position).
 */
export function tilesToFree(own: TileJob[], others: TileJob[]): string[] {
  const kept = new Set(others.map((j) => j.path));
  return own.map((j) => j.path).filter((p) => !kept.has(p));
}

export function estimateBytes(jobs: TileJob[]): number {
  return jobs.reduce((n, j) => n + AVERAGE_BYTES[j.source], 0);
}

const SOURCES: MapSource[] = ['antarctica', 'swisstopo', 'osm'];

function isArea(value: unknown): value is MapArea {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  const bbox = a['bbox'];
  return typeof a['id'] === 'string' && a['id'] !== '' && typeof a['name'] === 'string'
    && SOURCES.includes(a['source'] as MapSource)
    && Array.isArray(bbox) && bbox.length === 4 && bbox.every((v) => typeof v === 'number' && Number.isFinite(v))
    && typeof a['maxZoom'] === 'number' && Number.isInteger(a['maxZoom']) && (a['maxZoom'] as number) >= 0 && (a['maxZoom'] as number) <= 18
    && (a['preset'] === undefined || PRESETS.includes(a['preset'] as MapPreset));
}

/**
 * Areas arrive from the other iPad and from Firebase, so the limits the UI offers are checked again here:
 * maxZoom at most the source's finest level, at most TILE_CAP tiles (a preset has its own fixed plan).
 * Otherwise one oversized area would build a tile list large enough to freeze the app.
 */
function withinLimits(area: MapArea): boolean {
  if (area.preset !== undefined) return true;
  const finest = Math.max(...LEVELS[area.source].map((l) => l.maxZoom));
  const [w, s, e, n] = area.bbox;
  if (area.maxZoom > finest || w >= e || s >= n) return false;
  return countTiles(area.bbox, minZoomOf(area.source), area.maxZoom) <= TILE_CAP;
}

/**
 * A layer as stored: a known kind offered for the bbox, an integer maxZoom up to the kind's finest level, at most
 * TILE_CAP tiles. A preset has its own fixed plan: only the kinds of that plan are kept, and the zoom range is checked.
 */
function validLayer(value: unknown, bbox: Bbox, preset: MapPreset | undefined): value is AreaLayer {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Record<string, unknown>;
  const kind = l['kind'] as MapLayerKind;
  const maxZoom = l['maxZoom'];
  if (!LAYER_KINDS.includes(kind) || typeof maxZoom !== 'number' || !Number.isInteger(maxZoom) || maxZoom < 0 || maxZoom > 18) return false;
  if (preset !== undefined) return PRESET_KINDS[preset].includes(kind);
  if (!layerKindsFor(bbox).includes(kind)) return false;
  if (maxZoom > Math.max(...layerLevels(kind, bbox).map((level) => level.maxZoom))) return false;
  return countTiles(bbox, layerMinZoom(kind), maxZoom) <= TILE_CAP;
}

/**
 * The area with its layers: derived from `source` when the record has none (written before phase 4), otherwise the
 * valid layers, each kind once; `undefined` when no layer is left. The phase 3 limits on `source`/`maxZoom` hold for
 * every area, so both builds keep the same areas (`areaForWrite` writes within them).
 */
function withLayers(area: MapArea): MapArea | undefined {
  if (!withinLimits(area)) return undefined;
  const stored = (area as { layers?: unknown }).layers;
  if (stored === undefined) return { ...area, layers: derivedLayers(area) };
  if (!Array.isArray(stored)) return undefined;
  const layers: AreaLayer[] = [];
  for (const l of stored) {
    if (validLayer(l, area.bbox, area.preset) && !layers.some((x) => x.kind === l.kind)) layers.push({ kind: l.kind, maxZoom: l.maxZoom });
  }
  return layers.length > 0 ? { ...area, layers } : undefined;
}

/** The journal field `mapAreas` as stored in the change log; anything malformed or oversized is dropped. */
export function parseMapAreas(value: unknown): MapArea[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isArea).map(withLayers).filter((a): a is MapArea => a !== undefined);
}

/** Downloaded Blue Marble tiles (`tiles/gibs`): up to z4 the world background, up to z8 inside satellite areas. */
export function localGibsSource(tilesBaseUrl: string, maxNativeZoom: number, bounds?: Bbox): JournalTileSource {
  const source: JournalTileSource = { urlTemplate: `${tilesBaseUrl}/gibs/{z}/{x}/{y}.jpg`, maxNativeZoom, attribution: 'Imagery: NASA GIBS' };
  return bounds ? { ...source, bounds } : source;
}

/** Downloaded LIMA tiles (`tiles/lima`) from z9, bounded to the area. */
export function localLimaSource(tilesBaseUrl: string, maxZoom: number, bounds: Bbox): JournalTileSource {
  return { urlTemplate: `${tilesBaseUrl}/lima/{z}/{x}/{y}.png`, minZoom: 9, minNativeZoom: 9,
    maxNativeZoom: Math.min(LIMA_MAX_ZOOM, maxZoom), attribution: 'Landsat LIMA: USGS', bounds };
}

/** swisstopo from z6, bounded: the downloaded tiles up to `maxZoom`, or live up to z18 when `tilesBaseUrl` is undefined. */
export function swisstopoSource(tilesBaseUrl: string | undefined, maxZoom: number, bounds: Bbox): JournalTileSource {
  return {
    urlTemplate: tilesBaseUrl !== undefined ? `${tilesBaseUrl}/swisstopo/{z}/{x}/{y}.jpeg` : SWISSTOPO_TEMPLATE,
    minZoom: SWISSTOPO_MIN_ZOOM, minNativeZoom: SWISSTOPO_MIN_ZOOM, maxNativeZoom: tilesBaseUrl !== undefined ? maxZoom : 18,
    attribution: '© swisstopo', bounds,
  };
}

/** Downloaded OpenStreetMap vector tiles of an area; the subantarctic preset has one source per island group. */
export function localOsmSources(area: MapArea, maxZoom: number, tilesBaseUrl: string): JournalTileSource[] {
  const vector = (bounds: Bbox, maxNativeZoom: number): JournalTileSource => ({ kind: 'vector', urlTemplate: `${tilesBaseUrl}/osm/{z}/{x}/{y}.mvt`,
    maxNativeZoom, attribution: '© OpenStreetMap, Protomaps', bounds });
  if (area.preset === 'subantarctic-islands') return SUBANTARCTIC_ISLANDS.map((island) => vector(island.bbox, island.maxZoom));
  return [vector(area.bbox, maxZoom)];
}

/**
 * The map's layers for a journal. Areas in `downloaded` read local files; otherwise only sources that may be
 * used live are shown (Blue Marble, swisstopo) — OpenStreetMap and LIMA come only from downloaded areas.
 */
export function mapLayers(areas: MapArea[], downloaded: Set<string>, tilesBaseUrl: string): JournalTileSource[] {
  const offline = downloaded.size > 0 && tilesBaseUrl !== '';
  const layers: JournalTileSource[] = [offline ? localGibsSource(tilesBaseUrl, GIBS_MAX_ZOOM) : GIBS_BLUE_MARBLE];
  for (const area of areas) {
    const local = downloaded.has(area.id) && tilesBaseUrl !== '';
    switch (area.source) {
      case 'antarctica':
        if (local) layers.push(localLimaSource(tilesBaseUrl, area.maxZoom, area.bbox));
        break;
      case 'swisstopo':
        layers.push(swisstopoSource(local ? tilesBaseUrl : undefined, area.maxZoom, area.bbox));
        break;
      case 'osm':
        if (local) layers.push(...localOsmSources(area, area.maxZoom, tilesBaseUrl));
        break;
    }
  }
  return layers;
}
