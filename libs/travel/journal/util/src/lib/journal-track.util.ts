import { TRANSPORT_MODES, TransportMode, TripModel } from '@okr/shared-models';
import { decodeAltitudes, decodeTrack, encodeAltitudes, encodeTrack, TrackPoint, withAltitudes } from '@okr/mobility-tracker-util';
import { entityStateKey, EntityState, JournalState, viewOf } from './journal-merge.util';
import { sectionImageKeys, sectionTrackKey } from './journal-section.util';
import type { SectionView } from './journal-view.util';

/**
 * A recorded tracker trip as the journal holds it (spec 1.154 §6, §10; plan phase 5 decisions 1–3): the change-log
 * entity `track`, keyed `trk__<tripKey>` — one per trip and journal, so the same trip attached twice, or sent by the
 * iPhone and attached on the iPad, stays one entity that several track sections may refer to.
 *
 * The record is a read-only DERIVED COPY built by an allow-list (`trackCopyOf`): metadata, simplified points and the
 * photos' journal image keys. Never steps, strokes, split times, heart rate, crew or the trip's notes (activity-metrics
 * spec §214) — the copy reaches every author's device and, for published footprints, guests.
 *
 * Merge: an owned entity (OWNED_ENTITIES) — the owner is the author of the earliest create (who attached or sent it),
 * last writer wins among the owner's records, so re-deriving after a correction overwrites the copy. A second author
 * attaching the same trip later writes a create the merge ignores: the copy is identical (it is derived from the same
 * trip) and only the owner can correct it. A section referring to the key works for everybody.
 */
export interface TrackCopySection {
  mode: TransportMode;
  distanceM: number; // whole metres, as recorded (not along the simplified line)
  encoded: string; // the tracker's polyline codec (encodeTrack: lat, lng, t) over the simplified points
  altitudes?: string; // encodeAltitudes of the same points; absent when none carries a height
}

export interface TrackCopyPhoto { imageKey: string; lat: number; lng: number; takenAt: string }

export interface TrackCopy {
  tripKey: string;
  name: string;
  startedAt: string; // ISO
  endedAt: string;
  distanceM: number; // sum of the sections, whole metres
  durationS: number;
  modes: TransportMode[]; // in order of first appearance («zu Fuss · Zug · Bus»)
  sections: TrackCopySection[];
  photos: TrackCopyPhoto[]; // visible photos imported as journal images, by takenAt
}

/** A journal track as the UI reads it: the copy plus its entity key and owner. Points stay encoded (trackPointsOf). */
export interface TrackView extends TrackCopy {
  key: string;
  authorKey: string;
}

/** The input sections of `trackCopyOf`: the recorded points per section (the tracker's LocalSection fits). */
export interface TrackCopyInput { mode: TransportMode; points: TrackPoint[]; distanceM?: number }

export const TRACK_KEY_PREFIX = 'trk__';
export const TRACK_TOLERANCE_M = 5;
export const TRACK_MAX_POINTS = 2000;

/** The `track` entity key of a trip: one per trip and journal. */
export function trackKeyOf(tripKey: string): string {
  return `${TRACK_KEY_PREFIX}${tripKey}`;
}

// ------------------------------------------------------------------ simplification (decision 3)

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/** The points in metres on a plane through the first point (equirectangular: exact enough at a track's scale). */
function projected(points: TrackPoint[]): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const lat0 = points[0].lat;
  const lng0 = points[0].lng;
  const kx = Math.cos(lat0 * RAD) * EARTH_RADIUS_M * RAD;
  const ky = EARTH_RADIUS_M * RAD;
  return points.map((p) => ({ x: (p.lng - lng0) * kx, y: (p.lat - lat0) * ky }));
}

/** Distance in metres from p to the segment a–b. */
function segmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

/**
 * Douglas–Peucker run once without a tolerance: per point the largest tolerance at which it is still kept (its
 * distance when it was the farthest point of its span, capped by the spans above it). The split points do not depend on
 * the tolerance, so «keep every point above t» is exactly Douglas–Peucker at t — and raising t to meet the cap is a
 * threshold, not a new run. First and last are always kept (Infinity). Iterative: 20,000 points need no deep stack.
 */
function significance(points: TrackPoint[]): number[] {
  const out = new Array<number>(points.length).fill(0);
  if (points.length === 0) return out;
  out[0] = Number.POSITIVE_INFINITY;
  out[points.length - 1] = Number.POSITIVE_INFINITY;
  const xy = projected(points);
  const stack: [number, number, number][] = [[0, points.length - 1, Number.POSITIVE_INFINITY]];
  while (stack.length > 0) {
    const [start, end, cap] = stack.pop() as [number, number, number];
    if (end - start < 2) continue;
    let farthest = -1;
    let max = -1;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(xy[i], xy[start], xy[end]);
      if (d > max) {
        max = d;
        farthest = i;
      }
    }
    const value = Math.min(max, cap);
    out[farthest] = value;
    stack.push([start, farthest, value], [farthest, end, value]);
  }
  return out;
}

/** The threshold that keeps every point above `toleranceM` but no more than `max` of all `values`. */
function threshold(values: number[], toleranceM: number, max: number): number {
  if (values.length <= max) return toleranceM;
  const sorted = [...values].sort((a, b) => b - a);
  return Math.max(toleranceM, sorted[max] ?? toleranceM); // keep `> t`: at most `max` values lie above sorted[max]
}

/**
 * The points simplified by Douglas–Peucker on metres (decision 3): tolerance `toleranceM`, raised just far enough to
 * keep at most `max` points. First and last point are always kept; the kept points are the originals (with `t`, `alt`).
 */
export function simplifyTrack(points: TrackPoint[], toleranceM = TRACK_TOLERANCE_M, max = TRACK_MAX_POINTS): TrackPoint[] {
  return simplifySections([points], toleranceM, max)[0];
}

/** Like simplifyTrack, but the cap holds for all sections together (one threshold over the whole track). */
function simplifySections(sections: TrackPoint[][], toleranceM: number, max: number): TrackPoint[][] {
  const values = sections.map(significance);
  const t = threshold(values.flat(), toleranceM, max);
  return sections.map((points, s) => points.filter((_, i) => values[s][i] > t));
}

// ------------------------------------------------------------------ the derived copy (decision 2)

const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function pathLengthM(points: TrackPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const h = Math.sin(((b.lat - a.lat) * RAD) / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(((b.lng - a.lng) * RAD) / 2) ** 2;
    d += 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return d;
}

/**
 * The derived copy of a recorded trip (decision 2), by allow-list only. `sections` are the trip's recorded points per
 * section, in the trip's section order; a section's distance comes from the input, else from the trip's section at the
 * same index, else it is measured along the recorded points. `photoKeys` maps a photo's PhotoKit asset id to the
 * journal image it was imported as: only visible photos with an image key are listed.
 */
export function trackCopyOf(trip: TripModel, sections: TrackCopyInput[], photoKeys: Record<string, string>): TrackCopy {
  const simplified = simplifySections(sections.map((s) => s.points), TRACK_TOLERANCE_M, TRACK_MAX_POINTS);
  const copySections: TrackCopySection[] = sections.map((s, i) => {
    const distanceM = Math.round(finite(s.distanceM ?? trip.track?.sections[i]?.distanceM ?? pathLengthM(s.points)));
    const altitudes = encodeAltitudes(simplified[i]);
    return { mode: s.mode, distanceM, encoded: encodeTrack(simplified[i]), ...(altitudes !== undefined ? { altitudes } : {}) };
  });
  const photos: TrackCopyPhoto[] = (trip.track?.photos ?? [])
    .filter((p) => !p.hidden && typeof photoKeys[p.assetId] === 'string' && photoKeys[p.assetId] !== '')
    .map((p) => ({ imageKey: photoKeys[p.assetId], lat: finite(p.lat), lng: finite(p.lng), takenAt: String(p.takenAt ?? '') }))
    .sort((a, b) => (a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0));
  return {
    tripKey: trip.okey,
    name: trip.name ?? '',
    startedAt: trip.track?.startedAt ?? '',
    endedAt: trip.track?.endedAt ?? '',
    distanceM: copySections.reduce((sum, s) => sum + s.distanceM, 0),
    durationS: Math.round(finite(trip.track?.durationS)),
    modes: [...new Set(copySections.map((s) => s.mode))],
    sections: copySections,
    photos,
  };
}

/** The `track` record fields of a copy: the copy plus the journal it belongs to (as every other entity's record). */
export function trackRecordFields(journalKey: string, copy: TrackCopy): Record<string, unknown> {
  return { journalKey, ...copy };
}

/** The points of a track's sections, decoded (with their heights) — on demand, the lists hold the encoded copy only. */
export function trackPointsOf(track: Pick<TrackCopy, 'sections'>): { mode: TransportMode; distanceM: number; points: TrackPoint[] }[] {
  return track.sections.map((s) => {
    const points = decodeTrack(s.encoded);
    return { mode: s.mode, distanceM: s.distanceM, points: withAltitudes(points, decodeAltitudes(s.altitudes, points.length)) };
  });
}

// ------------------------------------------------------------------ reading the entity

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const isMode = (v: unknown): v is TransportMode => TRANSPORT_MODES.includes(v as TransportMode);

function sectionsFrom(value: unknown): TrackCopySection[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is Record<string, unknown> => isRecord(s) && isMode(s['mode']) && typeof s['encoded'] === 'string')
    .map((s) => ({
      mode: s['mode'] as TransportMode, distanceM: finite(s['distanceM']), encoded: s['encoded'] as string,
      ...(typeof s['altitudes'] === 'string' ? { altitudes: s['altitudes'] } : {}),
    }));
}

function photosFrom(value: unknown): TrackCopyPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is Record<string, unknown> => isRecord(p) && str(p['imageKey']) !== ''
    && typeof p['lat'] === 'number' && Number.isFinite(p['lat']) && typeof p['lng'] === 'number' && Number.isFinite(p['lng']))
    .map((p) => ({ imageKey: p['imageKey'] as string, lat: p['lat'] as number, lng: p['lng'] as number, takenAt: str(p['takenAt']) }));
}

function trackFrom(entity: EntityState, view: Record<string, unknown>): TrackView {
  return {
    key: entity.entityKey,
    authorKey: entity.ownerKey ?? '',
    tripKey: str(view['tripKey']),
    name: str(view['name']),
    startedAt: str(view['startedAt']),
    endedAt: str(view['endedAt']),
    distanceM: finite(view['distanceM']),
    durationS: finite(view['durationS']),
    modes: Array.isArray(view['modes']) ? view['modes'].filter(isMode) : [],
    sections: sectionsFrom(view['sections']),
    photos: photosFrom(view['photos']),
  };
}

/** The journal's tracks, newest first. A damaged record gives empty lists, never an exception. */
export function tracksOf(state: JournalState, journalKey: string): TrackView[] {
  const out: TrackView[] = [];
  for (const entity of Object.values(state)) {
    if (entity.entity !== 'track') continue;
    const view = viewOf(entity);
    if (view && view['journalKey'] === journalKey) out.push(trackFrom(entity, view));
  }
  return out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** One track by its entity key; undefined before its create arrived, once archived, or for an unknown key. */
export function trackOf(state: JournalState, key: string): TrackView | undefined {
  const entity = state[entityStateKey('track', key)];
  const view = viewOf(entity);
  return entity && view ? trackFrom(entity, view) : undefined;
}

/**
 * The journal photos a section shows, the photos of a track section's track included (they live in the `track`
 * entity, not in the section). Without the track (not received yet, archived) a track section shows none.
 */
export function sectionImageKeysIn(state: JournalState, view: Pick<SectionView, 'type' | 'properties'>): string[] {
  const own = sectionImageKeys(view);
  if (view.type !== 'track') return own;
  const track = trackOf(state, sectionTrackKey(view));
  return [...new Set([...own, ...(track?.photos.map((p) => p.imageKey) ?? [])])];
}
