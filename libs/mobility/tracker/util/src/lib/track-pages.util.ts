import type { TransportMode, TripModel } from '@okr/shared-models';
import type { LocalTrack } from './track-local.model';
import type { TrackPoint } from './track-polyline.util';
import { sectionFigures, sectionMeta, type LocalSection } from './track-sections.util';
import { summarize } from './track-summary.util';

/** Pure helpers of the tracker pages (spec 1.121, plan 2 task 9). */

/** One row of «Meine Strecken». */
export interface TrackListItem {
  key: string;
  name: string;
  startedAt: number; // ms epoch
  distanceM?: number; // known for uploaded trips only
  local: boolean; // a copy is on this device
  uploaded: boolean;
  needsUpload: boolean; // finished on this device, not uploaded yet → «Erneut hochladen»
}

function tripStartMs(trip: TripModel): number {
  const ms = Date.parse(trip.track?.startedAt ?? '');
  return Number.isNaN(ms) ? 0 : ms;
}

function tripDistanceM(trip: TripModel): number {
  return (trip.track?.sections ?? []).reduce((m, s) => m + (s.distanceM ?? 0), 0);
}

/**
 * Local tracks waiting for an upload first, then every other track newest first. Deduped by key: an uploaded
 * trip wins over its local copy (the store may not have marked the copy uploaded yet). Tracks still recording
 * or paused are left out — they belong to the banner / the resume prompt.
 */
export function mergeTrackLists(local: LocalTrack[], uploaded: TripModel[]): TrackListItem[] {
  const remote = new Map(uploaded.map((t) => [t.okey, t]));
  const done = local.filter((t) => t.state === 'done');
  const localKeys = new Set(done.map((t) => t.key));
  const pending: TrackListItem[] = [];
  const rest: TrackListItem[] = [];
  for (const t of done) {
    const trip = remote.get(t.key);
    if (trip) {
      rest.push({ key: t.key, name: trip.name, startedAt: tripStartMs(trip), distanceM: tripDistanceM(trip), local: true, uploaded: true, needsUpload: false });
    } else if (!t.uploaded) {
      pending.push({ key: t.key, name: t.name, startedAt: t.startedAt, local: true, uploaded: false, needsUpload: true });
    } else {
      rest.push({ key: t.key, name: t.name, startedAt: t.startedAt, local: true, uploaded: true, needsUpload: false });
    }
  }
  for (const trip of uploaded) {
    if (localKeys.has(trip.okey)) continue;
    rest.push({ key: trip.okey, name: trip.name, startedAt: tripStartMs(trip), distanceM: tripDistanceM(trip), local: false, uploaded: true, needsUpload: false });
  }
  const newestFirst = (a: TrackListItem, b: TrackListItem) => b.startedAt - a.startedAt;
  return [...pending.sort(newestFirst), ...rest.sort(newestFirst)];
}

/** Pairs the section metadata of a local track with its points (a missing group becomes []). */
export function toLocalSections(track: LocalTrack, points: TrackPoint[][]): LocalSection[] {
  return track.sections.map((s, i) => ({ ...sectionMeta(s), points: points[i] ?? [] }));
}

/** The inverse of toLocalSections: the track with the (corrected) section metadata and the points per section. */
export function fromLocalSections(track: LocalTrack, sections: LocalSection[]): { track: LocalTrack; points: TrackPoint[][] } {
  return {
    track: { ...track, sections: sections.map(sectionMeta) },
    points: sections.map((s) => s.points),
  };
}

/** An uploaded tracker trip as a local track (done, uploaded) plus its sections with points. */
export function localFromTrip(trip: TripModel, pointsBySection: TrackPoint[][]): { track: LocalTrack; sections: LocalSection[] } {
  const startedAt = tripStartMs(trip);
  const endedMs = Date.parse(trip.track?.endedAt ?? '');
  const track: LocalTrack = {
    key: trip.okey,
    state: 'done',
    uploaded: true,
    name: trip.name,
    startedAt,
    endedAt: Number.isNaN(endedMs) ? startedAt : endedMs,
    sections: (trip.track?.sections ?? []).map(sectionMeta),
  };
  return { track, sections: toLocalSections(track, pointsBySection) };
}

/** Rows for okr-track-sections. */
export function sectionRows(sections: LocalSection[]): {
  mode: TransportMode; distanceM: number; durationS: number; detected: boolean; steps?: number; splitAvgS?: number; splitBestS?: number;
}[] {
  return sections.map((s) => ({ mode: s.mode, detected: s.detected, ...summarize(s.points), ...sectionFigures(s) }));
}

/** The inner point a section is split at (its middle); -1 when it has no inner point (fewer than 3 points). */
export function middlePointIndex(count: number): number {
  if (count < 3) return -1;
  return Math.min(count - 2, Math.max(1, Math.floor((count - 1) / 2)));
}

/** Whole seconds between two epoch-ms instants, never negative. */
export function elapsedSeconds(fromMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - fromMs) / 1000));
}

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * GPX 1.1 of a recorded track: one <trk> per section that has points, each with the track's name, the section's
 * transport mode as <type> and one segment (GPX has no type per segment). Times in UTC.
 */
export function buildGpx(name: string, sections: LocalSection[]): string {
  const tracks = sections
    .filter((s) => s.points.length > 0)
    .map((s) => {
      const pts = s.points.map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`);
      return ['  <trk>', `    <name>${xml(name)}</name>`, `    <type>${s.mode}</type>`, '    <trkseg>', ...pts, '    </trkseg>', '  </trk>'].join('\n');
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="okr" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${xml(name)}</name></metadata>`,
    ...tracks,
    '</gpx>',
    '',
  ].join('\n');
}

/** A file name for the GPX export: letters and digits kept, everything else collapsed to «-». */
export function gpxFileName(name: string): string {
  const base = name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `${base || 'track'}.gpx`;
}

/**
 * True when two copies of a track are the same version: same correction counter (`rev`, missing = 0) and the
 * same name and sections (what an upload writes besides the points). The counter tells apart a newer correction
 * that happens to restore equal content.
 */
export function sameTrackContent(a: LocalTrack, b: LocalTrack): boolean {
  return (a.rev ?? 0) === (b.rev ?? 0)
    && a.name === b.name
    && a.sections.length === b.sections.length
    && a.sections.every((s, i) => s.mode === b.sections[i].mode && s.detected === b.sections[i].detected && s.steps === b.sections[i].steps);
}

/**
 * The track after an owner correction or rename: new sections (and name), `uploaded:false` so it is uploaded
 * again, the correction counter `rev` + 1, and — when it got fewer sections — the old count in `extraPointsUpTo`.
 */
export function correctedTrack(t: LocalTrack, sections: LocalTrack['sections'], name?: string): LocalTrack {
  const bound = Math.max(t.extraPointsUpTo ?? 0, t.sections.length);
  const out: LocalTrack = {
    ...t, name: name ?? t.name, sections: sections.map(sectionMeta), uploaded: false, rev: (t.rev ?? 0) + 1,
  };
  if (bound > sections.length) out.extraPointsUpTo = bound;
  else delete out.extraPointsUpTo;
  return out;
}

/** True when the native share sheet (or the Web Share API) was just closed without sharing. */
export function isShareCancel(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true;
  const message = (error as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && /cancel/i.test(message);
}
