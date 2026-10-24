import { GIBS_BLUE_MARBLE, JournalTileSource } from './journal-map.util';
import { Bbox, limaUrl, offlineTilePlan, ROUTE_BBOX, TileJob, tileRange } from './journal-tiles.util';

/**
 * Map areas of a journal (spec 1.113 §9.4, plan 6b): what the offline map covers, per journal. The source
 * follows the region — Antarctica (GIBS + LIMA, plan 6), Switzerland (swisstopo), anywhere else
 * OpenStreetMap vector tiles from the Protomaps planet build. Areas are the journal field `mapAreas` in
 * the change log, so both iPads have them.
 */
export type MapSource = 'antarctica' | 'swisstopo' | 'osm';
export type DetailLevel = 'overview' | 'detail' | 'hiking';

export interface MapArea {
  id: string;
  name: string;
  source: MapSource;
  bbox: Bbox;
  maxZoom: number;
  preset?: 'antarctica-expedition';
}

/** At most this many tiles per area: the action sheet offers only levels below it. */
export const TILE_CAP = 20_000;

/** Plan 6 as an area: route, peninsula and landing sites (plus the journal's footprints). */
export const ANTARCTICA_PRESET: MapArea = {
  id: 'antarctica-expedition', name: 'Antarktis-Expedition', source: 'antarctica', bbox: ROUTE_BBOX, maxZoom: 12, preset: 'antarctica-expedition',
};

const SWITZERLAND: Bbox = [5.9, 45.8, 10.5, 47.85];
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

export function areaTilePlan(area: MapArea, footprints: { lat: number; lng: number }[]): TileJob[] {
  if (area.preset === 'antarctica-expedition') return offlineTilePlan(footprints);
  switch (area.source) {
    case 'antarctica':
      return [...jobsFor('gibs', area.bbox, 3, Math.min(8, area.maxZoom)), ...jobsFor('lima', area.bbox, 9, Math.min(12, area.maxZoom))];
    case 'swisstopo':
      return jobsFor('swisstopo', area.bbox, SWISSTOPO_MIN_ZOOM, area.maxZoom);
    case 'osm':
      return jobsFor('osm', area.bbox, 0, area.maxZoom);
  }
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
    && (a['preset'] === undefined || a['preset'] === 'antarctica-expedition');
}

/** The journal field `mapAreas` as stored in the change log; anything malformed is dropped. */
export function parseMapAreas(value: unknown): MapArea[] {
  return Array.isArray(value) ? value.filter(isArea) : [];
}

/**
 * The map's layers for a journal. Areas in `downloaded` read local files; otherwise only sources that may be
 * used live are shown (Blue Marble, swisstopo) — OpenStreetMap and LIMA come only from downloaded areas.
 */
export function mapLayers(areas: MapArea[], downloaded: Set<string>, tilesBaseUrl: string): JournalTileSource[] {
  const offline = downloaded.size > 0 && tilesBaseUrl !== '';
  const layers: JournalTileSource[] = [
    offline ? { urlTemplate: `${tilesBaseUrl}/gibs/{z}/{x}/{y}.jpg`, maxNativeZoom: 8, attribution: 'Imagery: NASA GIBS' } : GIBS_BLUE_MARBLE,
  ];
  for (const area of areas) {
    const local = downloaded.has(area.id) && tilesBaseUrl !== '';
    switch (area.source) {
      case 'antarctica':
        if (local) {
          layers.push({ urlTemplate: `${tilesBaseUrl}/lima/{z}/{x}/{y}.png`, minZoom: 9, minNativeZoom: 9,
            maxNativeZoom: Math.min(12, area.maxZoom), attribution: 'Landsat LIMA: USGS', bounds: area.bbox });
        }
        break;
      case 'swisstopo':
        layers.push({
          urlTemplate: local ? `${tilesBaseUrl}/swisstopo/{z}/{x}/{y}.jpeg` : SWISSTOPO_TEMPLATE,
          minZoom: SWISSTOPO_MIN_ZOOM, minNativeZoom: SWISSTOPO_MIN_ZOOM, maxNativeZoom: local ? area.maxZoom : 18,
          attribution: '© swisstopo', bounds: area.bbox,
        });
        break;
      case 'osm':
        if (local) {
          layers.push({ kind: 'vector', urlTemplate: `${tilesBaseUrl}/osm/{z}/{x}/{y}.mvt`, maxNativeZoom: area.maxZoom,
            attribution: '© OpenStreetMap, Protomaps', bounds: area.bbox });
        }
        break;
    }
  }
  return layers;
}
