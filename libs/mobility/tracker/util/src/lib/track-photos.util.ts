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

/** How long after the last GPS fix a photo still belongs to the track. */
export const PHOTO_WINDOW_AFTER_LAST_FIX_MS = 30 * 60_000;

/**
 * End of the photo window: 30 min after the last recorded point (a resumed track may end long after it), never
 * later than endedAt; endedAt when there are no points.
 */
export function photoWindowEnd(sections: TrackPoint[][], endedAt: number): number {
  let last: number | undefined;
  for (const s of sections) for (const p of s) if (last === undefined || p.t > last) last = p.t;
  return last === undefined ? endedAt : Math.min(last + PHOTO_WINDOW_AFTER_LAST_FIX_MS, endedAt);
}

/**
 * The photos with the photo `assetId` hidden or shown (a new array); the same array when no photo has that assetId
 * or nothing changes. By assetId, not index: a merge search may re-sort the list meanwhile. Hiding drops the photo's thumbPath: its thumbnail is deleted from the bucket (hidden photos are never
 * uploaded) and a photo shown again gets a new one.
 */
export function withPhotoHidden<T extends TrackPhoto>(photos: T[], assetId: string, hidden: boolean): T[] {
  const p = photos.find((x) => x.assetId === assetId);
  if (!p || p.hidden === hidden) return photos;
  return photos.map((x) => {
    if (x !== p) return x;
    const next = { ...x, hidden };
    if (hidden) delete next.thumbPath;
    return next;
  });
}

/** The photos without photos[index] (a new array); the same array when the index is out of range. */
export function withoutPhoto<T>(photos: T[], index: number): T[] {
  if (index < 0 || index >= photos.length) return photos;
  return photos.filter((_, i) => i !== index);
}

/** A local photo as stored on the trip: the device-local path400 is never persisted, and no key is written as undefined. */
export function toServerPhoto(p: TrackPhoto & { path400?: string }): TrackPhoto {
  const out: TrackPhoto = { assetId: p.assetId, takenAt: p.takenAt, lat: p.lat, lng: p.lng, ownGps: p.ownGps, hidden: p.hidden };
  if (p.imageKey !== undefined) out.imageKey = p.imageKey;
  if (p.thumbPath !== undefined) out.thumbPath = p.thumbPath;
  return out;
}

/**
 * The photo list as written to the trip (spec §6: hidden photos are never uploaded): the hidden ones are left out
 * entirely — the local list keeps them with `hidden: true` — and path400 is stripped.
 */
export function serverPhotos(photos: readonly (TrackPhoto & { path400?: string })[] | undefined): TrackPhoto[] {
  return (photos ?? []).filter((p) => !p.hidden).map(toServerPhoto);
}

/**
 * A second search of the library merged into the photos already on the track (spec §6 «again on demand»): a photo
 * already there (same assetId) keeps its hidden flag and thumbPath and only takes the fresh local rendition; new
 * photos are added; the result is in time order. `added` = how many new photos came in.
 */
export function mergePhotos<T extends TrackPhoto & { path400?: string }>(
  existing: readonly T[] | undefined, found: readonly (TrackPhoto & { path400: string })[],
): { photos: (T | (TrackPhoto & { path400: string }))[]; added: number } {
  const byAsset = new Map(found.map((f) => [f.assetId, f]));
  const known = new Set((existing ?? []).map((p) => p.assetId));
  const kept = (existing ?? []).map((p) => {
    const f = byAsset.get(p.assetId);
    return f ? { ...p, path400: f.path400 } : p;
  });
  const fresh = found.filter((f) => !known.has(f.assetId));
  const photos = [...kept, ...fresh].sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt));
  return { photos, added: fresh.length };
}

/**
 * True when the photos of a finished local track should be searched again: the library is readable now and the
 * track has none yet, or its photos were found under limited access (more may be shared by now).
 */
export function wantsPhotoReattach(
  t: { state: string; photos?: readonly unknown[]; photosAccess?: 'full' | 'limited' }, access: string | undefined,
): boolean {
  if (t.state !== 'done' || (access !== 'full' && access !== 'limited')) return false;
  return !t.photos || t.photos.length === 0 || t.photosAccess === 'limited';
}

/** The number of a thumbnail path (`…/{n}.jpg`); undefined for anything else. */
export function thumbNumber(thumbPath: string | undefined): number | undefined {
  const m = thumbPath?.match(/\/([0-9]+)\.jpg$/);
  return m ? Number(m[1]) : undefined;
}

/**
 * The next free thumbnail number of a track: above the stored sequence, every number still referenced and the
 * photo count (the first uploads numbered thumbnails by list index).
 */
export function nextThumbNumber(photos: readonly { thumbPath?: string }[] | undefined, thumbSeq: number | undefined): number {
  let next = Math.max(thumbSeq ?? 0, photos?.length ?? 0);
  for (const p of photos ?? []) {
    const n = thumbNumber(p.thumbPath);
    if (n !== undefined && n >= next) next = n + 1;
  }
  return next;
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
