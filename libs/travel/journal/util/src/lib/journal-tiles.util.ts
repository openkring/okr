import { JournalTileSource } from './journal-map.util';

/**
 * The offline map of the trip (spec 1.113 §9.4, plan 6): which tiles the iPad downloads before departure.
 * NASA GIBS Blue Marble for the whole route (z3–8, XYZ tiles) and LIMA, the Landsat mosaic of Antarctica,
 * from the USGS WMS for the peninsula (z9–10) and around the landing sites (z11–12). The WMS speaks only
 * EPSG:4326, so each Mercator tile is fetched as its latitude/longitude box at 256 px; inside one tile the
 * Mercator stretch changes by about 1 %, below one pixel. LIMA tiles are transparent PNGs: outside the
 * mosaic the WMS paints white, which as JPEG would cover the sea of the Blue Marble layer below.
 */
export type Bbox = [west: number, south: number, east: number, north: number];

/** One tile to download; `url` is empty for OpenStreetMap tiles, which are read from the Protomaps build. */
export interface TileJob { source: 'gibs' | 'lima' | 'swisstopo' | 'osm'; z: number; x: number; y: number; url: string; path: string }

/** Ushuaia → Drake Passage → South Shetlands → Antarctic Peninsula. */
export const ROUTE_BBOX: Bbox = [-72, -67, -54, -52];
/** The peninsula's west coast and the South Shetlands, where the ships land. */
export const PENINSULA_BBOX: Bbox = [-64.5, -65.5, -56.5, -62];
/** LIMA covers Antarctica south of about 60° S; positions further north get no detail tiles. */
const LIMA_NORTH = -60;
const SITE_RADIUS_KM = 8;

/** Common landing sites (approximate). The journal's own footprint positions are added on top. */
export const LANDING_SITES: { name: string; lat: number; lng: number }[] = [
  { name: 'Deception Island', lat: -62.98, lng: -60.56 },
  { name: 'Half Moon Island', lat: -62.595, lng: -59.92 },
  { name: 'Yankee Harbour', lat: -62.53, lng: -59.78 },
  { name: 'Hannah Point', lat: -62.65, lng: -60.61 },
  { name: 'Aitcho Islands', lat: -62.4, lng: -59.77 },
  { name: 'Mikkelsen Harbour', lat: -63.9, lng: -60.78 },
  { name: 'Brown Bluff', lat: -63.53, lng: -56.92 },
  { name: 'Enterprise Island', lat: -64.54, lng: -62.0 },
  { name: 'Orne Harbour', lat: -64.63, lng: -62.54 },
  { name: 'Cuverville Island', lat: -64.68, lng: -62.63 },
  { name: 'Danco Island', lat: -64.73, lng: -62.6 },
  { name: 'Neko Harbour', lat: -64.84, lng: -62.53 },
  { name: 'Paradise Harbour', lat: -64.895, lng: -62.87 },
  { name: 'Port Lockroy', lat: -64.825, lng: -63.49 },
  { name: 'Damoy Point', lat: -64.81, lng: -63.53 },
  { name: 'Lemaire Channel', lat: -65.07, lng: -63.97 },
  { name: 'Pleneau Island', lat: -65.1, lng: -64.06 },
  { name: 'Petermann Island', lat: -65.17, lng: -64.14 },
  { name: 'Vernadsky Station', lat: -65.245, lng: -64.257 },
];

/** Falklands → South Georgia → South Sandwich Islands: the open sea between them, as Blue Marble only. */
export const SUBANTARCTIC_BBOX: Bbox = [-62, -60, -25, -50];

/**
 * The island groups of the Scotia Sea, north of the LIMA mosaic: OpenStreetMap detail, each to its own zoom.
 * The South Sandwich Islands are mostly sea and rarely landed on, so they stop at overview.
 */
export const SUBANTARCTIC_ISLANDS: { name: string; bbox: Bbox; maxZoom: number }[] = [
  { name: 'Falkland Islands', bbox: [-61.5, -52.5, -57.6, -51.0], maxZoom: 13 },
  { name: 'South Georgia', bbox: [-38.3, -55.0, -35.6, -53.9], maxZoom: 13 },
  { name: 'South Sandwich Islands', bbox: [-28.3, -59.6, -26.1, -56.2], maxZoom: 11 },
];

const GIBS_TEMPLATE ='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg';
const LIMA_WMS = 'https://nimbus.cr.usgs.gov/arcgis/services/Antarctica/USGS_EROS_Antarctica_LANDSAT/MapServer/WMSServer';
const LIMA_LAYERS = [1, 2, 3, 4, 5, 6].map((n) => `LANDSAT_15M_RGB_REF_0${n}`).join(',');

const lonToX = (lon: number, z: number): number => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number): number => {
  const rad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
};
const xToLon = (x: number, z: number): number => (x / 2 ** z) * 360 - 180;
const yToLat = (y: number, z: number): number => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export function tileRange([west, south, east, north]: Bbox, z: number): { x0: number; x1: number; y0: number; y1: number } {
  const max = 2 ** z - 1;
  return {
    x0: Math.max(0, lonToX(west, z)), x1: Math.min(max, lonToX(east, z)),
    y0: Math.max(0, latToY(north, z)), y1: Math.min(max, latToY(south, z)),
  };
}

export function tileBounds(z: number, x: number, y: number): { west: number; south: number; east: number; north: number } {
  return { west: xToLon(x, z), east: xToLon(x + 1, z), north: yToLat(y, z), south: yToLat(y + 1, z) };
}

/** WMS 1.3.0 with EPSG:4326 takes the box in latitude,longitude order. */
export function limaUrl(z: number, x: number, y: number): string {
  const b = tileBounds(z, x, y);
  const bbox = [b.south, b.west, b.north, b.east].map((v) => v.toFixed(6)).join(',');
  return `${LIMA_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${LIMA_LAYERS}&STYLES=&CRS=EPSG:4326`
    + `&BBOX=${bbox}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE`;
}

function siteBbox(lat: number, lng: number): Bbox {
  const dLat = SITE_RADIUS_KM / 111;
  const dLng = SITE_RADIUS_KM / (111 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/** Every tile to download, each once: route (GIBS z3–8), peninsula (LIMA z9–10), sites (LIMA z11–12). */
export function offlineTilePlan(extraSites: { lat: number; lng: number }[]): TileJob[] {
  const jobs = new Map<string, TileJob>();
  const add = (source: TileJob['source'], bbox: Bbox, zooms: number[]): void => {
    for (const z of zooms) {
      const r = tileRange(bbox, z);
      for (let x = r.x0; x <= r.x1; x++) {
        for (let y = r.y0; y <= r.y1; y++) {
          const path = `tiles/${source}/${z}/${x}/${y}.${source === 'gibs' ? 'jpg' : 'png'}`;
          if (jobs.has(path)) continue;
          const url = source === 'gibs'
            ? GIBS_TEMPLATE.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x))
            : limaUrl(z, x, y);
          jobs.set(path, { source, z, x, y, url, path });
        }
      }
    }
  };
  add('gibs', ROUTE_BBOX, [3, 4, 5, 6, 7, 8]);
  add('lima', PENINSULA_BBOX, [9, 10]);
  for (const site of [...LANDING_SITES, ...extraSites]) {
    if (site.lat > LIMA_NORTH) continue;
    add('lima', siteBbox(site.lat, site.lng), [11, 12]);
  }
  return [...jobs.values()];
}

/** The downloaded map as Leaflet layers: Blue Marble up to z8 (enlarged beyond), LIMA from z9 on top. */
export function localTileSources(tilesBaseUrl: string): JournalTileSource[] {
  return [
    { urlTemplate: `${tilesBaseUrl}/gibs/{z}/{x}/{y}.jpg`, maxNativeZoom: 8, attribution: 'Imagery: NASA GIBS' },
    { urlTemplate: `${tilesBaseUrl}/lima/{z}/{x}/{y}.png`, minZoom: 9, minNativeZoom: 9, maxNativeZoom: 12, attribution: 'Landsat LIMA: USGS' },
  ];
}
