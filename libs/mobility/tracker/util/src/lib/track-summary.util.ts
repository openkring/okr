import type { TrackPoint } from './track-polyline.util';

const EARTH_RADIUS_M = 6371008.8;

/** Great-circle (haversine) distance in metres. */
export function distanceM(a: Pick<TrackPoint, 'lat' | 'lng'>, b: Pick<TrackPoint, 'lat' | 'lng'>): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function summarize(points: TrackPoint[]): { distanceM: number; durationS: number } {
  if (points.length < 2) return { distanceM: 0, durationS: 0 };
  let d = 0;
  for (let i = 1; i < points.length; i++) d += distanceM(points[i - 1], points[i]);
  return { distanceM: d, durationS: Math.round((points[points.length - 1].t - points[0].t) / 1000) };
}
