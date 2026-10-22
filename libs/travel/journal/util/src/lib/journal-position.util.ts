/**
 * Footprint position and route from photo GPS (spec 1.113 §6.2, §6.3). `takenAt` is the local
 * wall-clock time stored in the photo ('yyyy-MM-ddTHH:mm:ss'), so it sorts as a string.
 * A photo at exactly 0/0 carries a placeholder, not a position.
 */
export interface PhotoPosition { takenAt: string; latitude?: number; longitude?: number }

function hasPosition(p: PhotoPosition): p is PhotoPosition & { latitude: number; longitude: number } {
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0);
}

function byTime(photos: PhotoPosition[]) {
  return photos.filter(hasPosition).sort((a, b) => (a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0));
}

/** The position of the earliest photo with GPS. */
export function footprintPosition(photos: PhotoPosition[]): { latitude: number; longitude: number } | undefined {
  const [first] = byTime(photos);
  return first ? { latitude: first.latitude, longitude: first.longitude } : undefined;
}

/** All photo positions as [lat, lon], in time order. */
export function routePoints(photos: PhotoPosition[]): [number, number][] {
  return byTime(photos).map((p) => [p.latitude, p.longitude]);
}
