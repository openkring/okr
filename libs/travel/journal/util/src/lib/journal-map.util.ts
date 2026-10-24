import { routePoints } from './journal-position.util';
import { FootprintView, ImageView } from './journal-view.util';

/**
 * Map data for the journal overview (spec 1.113 §9.1, §6.3): one pin per footprint with a position, and
 * the dashed route through ALL photo positions in time order.
 */
export interface JournalTileSource {
  urlTemplate: string;
  maxNativeZoom: number;
  attribution: string;
  minZoom?: number; // the layer is hidden below
  minNativeZoom?: number;
  kind?: 'raster' | 'vector'; // vector = OpenStreetMap tiles (Protomaps), drawn by protomaps-leaflet
  bounds?: [west: number, south: number, east: number, north: number]; // tiles are only requested inside
}

/** NASA GIBS Blue Marble, EPSG:3857, up to zoom 8 (spike S4, NASA open data). */
export const GIBS_BLUE_MARBLE: JournalTileSource = {
  urlTemplate: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
  maxNativeZoom: 8,
  attribution: 'Imagery: NASA GIBS',
};

export interface JournalPin { key: string; lat: number; lng: number; imagePath?: string; label: string }

export function journalMapData(footprints: FootprintView[], images: Map<string, ImageView>): { route: [number, number][]; pins: JournalPin[] } {
  const pins: JournalPin[] = [];
  for (const fp of footprints) {
    if (fp.latitude === undefined || fp.longitude === undefined) continue;
    const firstPhotoBlock = fp.blocks.find((b) => b.kind === 'photos' && (b.imageKeys?.length ?? 0) > 0);
    const firstImage = firstPhotoBlock?.imageKeys?.map((k) => images.get(k)).find((i) => i !== undefined);
    pins.push({ key: fp.key, lat: fp.latitude, lng: fp.longitude, imagePath: firstImage?.path400, label: fp.title });
  }
  const photos = [...images.values()].map((i) => ({ takenAt: i.takenAt ?? '', latitude: i.latitude, longitude: i.longitude }));
  return { route: routePoints(photos), pins };
}

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Length of the route in whole kilometres (haversine per leg). */
export function routeLengthKm(route: [number, number][]): number {
  let km = 0;
  for (let i = 1; i < route.length; i++) {
    const [lat1, lng1] = route[i - 1];
    const [lat2, lng2] = route[i];
    const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    km += 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  }
  return Math.round(km);
}
