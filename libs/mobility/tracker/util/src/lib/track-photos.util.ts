import { DiaryTarget, resolveDiaryTargets, TrackPhoto } from '@okr/shared-models';
import { TrackPoint } from './track-polyline.util';

/** A photo from the device library, with its local 400 px rendition. */
export interface LibraryPhoto {
  assetId: string;
  takenAt: number; // ms epoch
  lat?: number;
  lng?: number;
  path400: string;
}

/** Position on the track at time t (linear interpolation, clamped to the ends). Undefined only for no points. */
export function positionAt(points: TrackPoint[], t: number): { lat: number; lng: number } | undefined {
  if (points.length === 0) return undefined;
  const first = points[0];
  if (t <= first.t) return { lat: first.lat, lng: first.lng };
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (t <= b.t) {
      const a = points[i - 1];
      const span = b.t - a.t;
      const f = span > 0 ? (t - a.t) / span : 0;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
    }
  }
  const last = points[points.length - 1];
  return { lat: last.lat, lng: last.lng };
}

/** Photos taken within [from, to], positioned by own GPS or interpolated from the track, sorted by time. `path400` is device-local and must be stripped before persisting. */
export function placePhotos(
  photos: LibraryPhoto[],
  sections: TrackPoint[][],
  from: number,
  to: number,
): (TrackPhoto & { path400: string })[] {
  const points = sections.flat().sort((a, b) => a.t - b.t);
  const out: (TrackPhoto & { path400: string })[] = [];
  for (const p of [...photos].sort((a, b) => a.takenAt - b.takenAt)) {
    if (p.takenAt < from || p.takenAt > to) continue;
    const ownGps = p.lat !== undefined && p.lng !== undefined;
    const pos = ownGps ? { lat: p.lat as number, lng: p.lng as number } : positionAt(points, p.takenAt);
    if (!pos) continue;
    out.push({
      assetId: p.assetId,
      takenAt: new Date(p.takenAt).toISOString(),
      lat: pos.lat,
      lng: pos.lng,
      ownGps,
      hidden: false,
      path400: p.path400,
    });
  }
  return out;
}

/** The trip's own tenant first, then the diary targets that take `tracker` entries on that date. */
export function trackTenants(own: string, targets: DiaryTarget[] | undefined, startDate: string): string[] {
  const out = [own];
  for (const id of resolveDiaryTargets(targets, 'tracker', startDate)) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function trackThumbPath(tenantId: string, tripKey: string, n: number): string {
  return `tenant/${tenantId}/tracks/${tripKey}/${n}.jpg`;
}

/** The local calendar day (StoreDate yyyyMMdd) of an epoch-millisecond timestamp. */
export function localStoreDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
