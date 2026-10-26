import type { TransportMode } from '@okr/shared-models';
import { detectStep, type DetectionInput, type DetectState } from './track-detection.util';
import type { LocalTrack } from './track-local.model';
import type { TrackPoint } from './track-polyline.util';
import { distanceM } from './track-summary.util';

/** Pure decisions of a recording session; TrackerStore stays a thin orchestration over them. */
/** `startFailed` is set by the store when the native plugin refuses to start on a device (not a permission answer). */
export type StartWarning = 'none' | 'whenInUseOnly' | 'locationDenied' | 'motionDenied' | 'notNative' | 'startFailed';

/** The permission answer of the native plugin; undefined when there is no plugin (web, or the call failed). */
export function startWarning(p: { location: string; motion: string } | undefined): StartWarning {
  if (!p) return 'notNative';
  if (p.location === 'denied') return 'locationDenied';
  if (p.location === 'whenInUse') return 'whenInUseOnly';
  if (p.motion === 'denied') return 'motionDenied';
  return 'none';
}

/** The track that was still recording or paused when the app went away. */
export function resumeDecision(tracks: LocalTrack[]): LocalTrack | undefined {
  return tracks.find((t) => t.state === 'recording' || t.state === 'paused');
}

export function needsUpload(t: LocalTrack): boolean {
  return t.state === 'done' && !t.uploaded;
}

/** A visible photo whose thumbnail is not uploaded yet. */
function missingThumb(p: NonNullable<LocalTrack['photos']>[number]): boolean {
  return !p.hidden && !p.thumbPath;
}

/**
 * The trip is on the server but its visible photos are not confirmed there yet (a thumbnail is missing, or the photo
 * list with the thumb paths was not acked): the thumbnail step runs after the trip commit (the storage rule reads
 * the trip) and the pending-upload loop retries it.
 */
export function needsThumbUpload(t: LocalTrack): boolean {
  return t.uploaded && !t.photosUploaded && (t.photos ?? []).some((p) => !p.hidden);
}

/** True when every visible photo carries its thumbPath. */
export function allThumbsUploaded(photos: LocalTrack['photos']): boolean {
  return !(photos ?? []).some(missingThumb);
}

/**
 * The photos with the uploaded thumbnails' paths (and a refreshed local path400, if any) copied in by assetId
 * (a new array; unknown assetIds are ignored).
 */
export function withThumbPaths(
  photos: NonNullable<LocalTrack['photos']>, uploaded: { assetId: string; thumbPath: string; path400?: string }[],
): NonNullable<LocalTrack['photos']> {
  const byAsset = new Map(uploaded.map((u) => [u.assetId, u]));
  return photos.map((p) => {
    const u = byAsset.get(p.assetId);
    if (!u) return p;
    return u.path400 === undefined ? { ...p, thumbPath: u.thumbPath } : { ...p, thumbPath: u.thumbPath, path400: u.path400 };
  });
}

/** A new section begins with the last point of the old one, so the line stays connected. */
export function nextSectionStartPoint(lastPoint: TrackPoint | undefined): TrackPoint | undefined {
  return lastPoint ? { ...lastPoint } : undefined;
}

/** Running distance: adds the leg from the previous fix (none for the first one). */
export function accumulateDistance(totalM: number, prev: TrackPoint | undefined, next: TrackPoint): number {
  return prev ? totalM + distanceM(prev, next) : totalM;
}

/** A native location fix as a track point. */
export function toTrackPoint(l: { lat: number; lng: number; accuracy: number | null; time: number }): TrackPoint {
  const p: TrackPoint = { lat: l.lat, lng: l.lng, t: l.time };
  if (l.accuracy !== null && l.accuracy !== undefined) p.acc = l.accuracy;
  return p;
}

/**
 * detectStep for a session: an unlocked state switches as usual. A locked state (row/ski/ship) never switches
 * by itself; a stable change is returned as `proposal` for the person to accept.
 */
export function sessionDetectStep(s: DetectState, i: DetectionInput): { state: DetectState; switchTo?: TransportMode; proposal?: TransportMode } {
  if (!s.locked) return detectStep(s, i);
  const shadow = detectStep({ ...s, locked: false }, i);
  if (shadow.switchTo) return { state: { mode: s.mode, locked: true }, proposal: shadow.switchTo };
  return { state: { ...shadow.state, mode: s.mode, locked: true } };
}

/**
 * The track's sections after a mode change. A section without points only changes its mode; the same mode
 * continues the section; otherwise a new section begins (newSection: the caller seeds it with the last point).
 */
export function nextSections(
  sections: LocalTrack['sections'], mode: TransportMode, detected: boolean, currentHasPoints: boolean,
): { sections: LocalTrack['sections']; newSection: boolean } {
  const last = sections[sections.length - 1];
  if (!last) return { sections: [{ mode, detected }], newSection: true };
  const head = sections.slice(0, -1);
  if (!currentHasPoints) return { sections: [...head, { mode, detected }], newSection: false };
  if (last.mode === mode) return { sections: [...head, { mode, detected: last.detected && detected }], newSection: false };
  return { sections: [...sections, { mode, detected }], newSection: true };
}

/** Points per section, exactly one group per known section (a section without points gets []). */
export function alignSections(points: TrackPoint[][], count: number): TrackPoint[][] {
  return Array.from({ length: count }, (_, i) => points[i] ?? []);
}

/**
 * Who pending uploads would be written for: an id once both the person and the auth uid are known, else undefined.
 * The store runs the pending-upload loop whenever this id appears or changes (once per sign-in, not per emission).
 */
export function pendingUploadOwner(personKey: string | undefined, uid: string | undefined): string | undefined {
  return personKey && uid ? `${uid}|${personKey}` : undefined;
}

/**
 * The track's sections when recording resumes after a pause (or a relaunch): a section with points is closed and a
 * new one in the same mode begins, NOT seeded with the last point — the map shows a gap and the distance across
 * the pause is not counted. A section still without points simply continues.
 */
export function sectionsAfterPause(
  sections: LocalTrack['sections'], currentHasPoints: boolean,
): { sections: LocalTrack['sections']; newSection: boolean } {
  const last = sections[sections.length - 1];
  if (!last) return { sections: [{ mode: 'foot', detected: true }], newSection: true };
  if (!currentHasPoints) return { sections, newSection: false };
  return { sections: [...sections, { mode: last.mode, detected: last.detected }], newSection: true };
}

/** A recording without a single GPS point (discarded at stop instead of uploaded). */
export function hasNoPoints(groups: TrackPoint[][]): boolean {
  return groups.every((g) => g.length === 0);
}
