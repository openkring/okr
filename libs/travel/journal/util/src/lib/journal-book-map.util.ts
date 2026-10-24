import { Box } from './journal-book-layout.util';

/**
 * The pure parts of the book maps (design 2026-10-24 §8): the pixel size of a map frame at print resolution,
 * the bounds of a route and the zoom limit given by the imagery. The canvas work is in the ui lib.
 */
const MM_PER_INCH = 25.4;
/** Used when no raster layer says how fine its imagery is. */
export const BOOK_MAP_DEFAULT_MAX_ZOOM = 12;
/** A route of one point (or a stretch of a few metres) still gets a window of about this many degrees. */
const MIN_SPAN_DEG = 0.02;

export type LngLat = [number, number];
/** west, south, east, north */
export type BookMapBounds = [number, number, number, number];

/** Pixel size of a frame of `box` (mm) at `dpi`. */
export function bookMapPixels(box: Pick<Box, 'w' | 'h'>, dpi: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round((box.w * dpi) / MM_PER_INCH)),
    height: Math.max(1, Math.round((box.h * dpi) / MM_PER_INCH)),
  };
}

/** Millimetres to pixels at `dpi` (dot sizes, text sizes), not rounded. */
export function mmToPx(mm: number, dpi: number): number {
  return (mm * dpi) / MM_PER_INCH;
}

/**
 * Bounds of `points` ([lng, lat]) with `padRatio` of the span added on every side (0.1 = 10 %). A single point,
 * or points closer than a few metres, get a minimum window so the camera never has to fit an empty box.
 * Latitudes stay within the Mercator range; the antimeridian is not handled (the journals do not cross it).
 */
export function bookMapBounds(points: LngLat[], padRatio: number): BookMapBounds | undefined {
  const valid = points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (valid.length === 0) return undefined;
  let west = Math.min(...valid.map((p) => p[0]));
  let east = Math.max(...valid.map((p) => p[0]));
  let south = Math.min(...valid.map((p) => p[1]));
  let north = Math.max(...valid.map((p) => p[1]));
  if (east - west < MIN_SPAN_DEG) {
    const mid = (east + west) / 2;
    west = mid - MIN_SPAN_DEG / 2;
    east = mid + MIN_SPAN_DEG / 2;
  }
  if (north - south < MIN_SPAN_DEG) {
    const mid = (north + south) / 2;
    south = mid - MIN_SPAN_DEG / 2;
    north = mid + MIN_SPAN_DEG / 2;
  }
  const padLng = (east - west) * Math.max(0, padRatio);
  const padLat = (north - south) * Math.max(0, padRatio);
  return [
    Math.max(-180, west - padLng),
    Math.max(-85, south - padLat),
    Math.min(180, east + padLng),
    Math.min(85, north + padLat),
  ];
}

/** The finest zoom the imagery has (the highest native zoom of any layer); the camera never zooms further in. */
export function bookMapMaxZoom(maxNativeZooms: number[]): number {
  const zooms = maxNativeZooms.filter((z) => Number.isFinite(z));
  return zooms.length ? Math.max(...zooms) : BOOK_MAP_DEFAULT_MAX_ZOOM;
}

/** `zoom` limited to [0, max]. */
export function clampBookZoom(zoom: number, max: number): number {
  return Math.max(0, Math.min(zoom, max));
}
