import type { TrackSection, TransportMode } from '@okr/shared-models';
import type { TrackPoint } from './track-polyline.util';
import { summarize } from './track-summary.util';

/** A section with its points, as kept locally before upload. */
export interface LocalSection {
  mode: TransportMode;
  detected: boolean;
  points: TrackPoint[];
}

function validIndex(s: LocalSection[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < s.length;
}

function joinPoints(a: TrackPoint[], b: TrackPoint[]): TrackPoint[] {
  const last = a[a.length - 1];
  const first = b[0];
  const shared = last && first && last.lat === first.lat && last.lng === first.lng && last.t === first.t;
  return [...a, ...(shared ? b.slice(1) : b)];
}

function combine(a: LocalSection, b: LocalSection, mode: TransportMode): LocalSection {
  return { mode, detected: a.detected && b.detected, points: joinPoints(a.points, b.points) };
}

/** Owner correction: sets the mode (detected=false) and merges with an equal-mode neighbour. */
export function setSectionMode(s: LocalSection[], index: number, mode: TransportMode): LocalSection[] {
  if (!validIndex(s, index)) return s;
  const out = s.map((x, i) => (i === index ? { ...x, mode, detected: false } : x));
  let at = index;
  if (at > 0 && out[at - 1].mode === mode) {
    out.splice(at - 1, 2, combine(out[at - 1], out[at], mode));
    at -= 1;
  }
  if (at < out.length - 1 && out[at + 1].mode === mode) {
    out.splice(at, 2, combine(out[at], out[at + 1], mode));
  }
  return out;
}

/** Splits at an inner point; the split point belongs to both halves so the line stays connected. */
export function splitSection(s: LocalSection[], index: number, pointIndex: number, mode: TransportMode): LocalSection[] {
  if (!validIndex(s, index)) return s;
  const sec = s[index];
  if (!Number.isInteger(pointIndex) || pointIndex < 1 || pointIndex > sec.points.length - 2) return s;
  const head: LocalSection = { ...sec, points: sec.points.slice(0, pointIndex + 1) };
  const tail: LocalSection = { mode, detected: false, points: sec.points.slice(pointIndex) };
  return [...s.slice(0, index), head, tail, ...s.slice(index + 1)];
}

/** Merges section `index` with the next one; the longer section (by distance) decides the mode. */
export function mergeWithNext(s: LocalSection[], index: number): LocalSection[] {
  if (!validIndex(s, index) || index + 1 >= s.length) return s;
  const a = s[index];
  const b = s[index + 1];
  const mode = summarize(b.points).distanceM > summarize(a.points).distanceM ? b.mode : a.mode;
  return [...s.slice(0, index), combine(a, b, mode), ...s.slice(index + 2)];
}

export function toTrackSections(s: LocalSection[], tripKey: string): TrackSection[] {
  return s.map((sec, i) => ({
    mode: sec.mode,
    detected: sec.detected,
    startedAt: new Date(sec.points[0]?.t ?? 0).toISOString(),
    endedAt: new Date(sec.points[sec.points.length - 1]?.t ?? 0).toISOString(),
    distanceM: summarize(sec.points).distanceM,
    pointsPath: `trips/${tripKey}/track-points/${i}`,
  }));
}
