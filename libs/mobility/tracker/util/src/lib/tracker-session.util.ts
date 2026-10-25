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
