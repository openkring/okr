import type { TrackSection, TransportMode } from '@okr/shared-models';
import type { TrackPoint } from './track-polyline.util';
import { summarize } from './track-summary.util';
import { rowSplits } from './track-split.util';
import { strokeFigures } from './track-strokes.util';

/** A section with its points, as kept locally before upload. */
export interface LocalSection {
  mode: TransportMode;
  detected: boolean;
  points: TrackPoint[];
  steps?: number; // foot only (spec 1.122)
  strokeTimes?: number[]; // row only: stroke times in ms (spec 1.122 2c); kept in TrackDb / track-points, never in the track row
}

/** A section's metadata as kept in `LocalTrack.sections`: steps only when known. */
export function sectionMeta(s: { mode: TransportMode; detected: boolean; steps?: number }): { mode: TransportMode; detected: boolean; steps?: number } {
  return s.steps === undefined ? { mode: s.mode, detected: s.detected } : { mode: s.mode, detected: s.detected, steps: s.steps };
}

/** Sets or removes `steps` (never writes an undefined key). */
function withSteps<T extends { steps?: number }>(s: T, steps: number | undefined): T {
  const out = { ...s };
  if (steps === undefined) delete out.steps;
  else out.steps = steps;
  return out;
}

/** Sets or removes `strokeTimes` (never writes an undefined key). */
function withStrokes<T extends { strokeTimes?: number[] }>(s: T, times: number[] | undefined): T {
  const out = { ...s };
  if (times === undefined) delete out.strokeTimes;
  else out.strokeTimes = times;
  return out;
}

/** Splits a step count by the distance of two parts; the sum is preserved, no distance → all on the head. */
export function splitStepsByDistance(steps: number | undefined, headM: number, tailM: number): [number | undefined, number | undefined] {
  if (steps === undefined) return [undefined, undefined];
  const total = headM + tailM;
  if (total <= 0) return [steps, 0];
  const head = Math.round((steps * headM) / total);
  return [head, steps - head];
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
  const known = [a.steps, b.steps].filter((x): x is number => x !== undefined);
  const steps = mode === 'foot' && known.length > 0 ? known.reduce((x, y) => x + y, 0) : undefined;
  const strokes = mode === 'row' && (a.strokeTimes || b.strokeTimes) ? [...(a.strokeTimes ?? []), ...(b.strokeTimes ?? [])] : undefined;
  return withStrokes(withSteps<LocalSection>({ mode, detected: a.detected && b.detected, points: joinPoints(a.points, b.points) }, steps), strokes);
}

/** Owner correction: sets the mode (detected=false) and merges with an equal-mode neighbour. */
export function setSectionMode(s: LocalSection[], index: number, mode: TransportMode): LocalSection[] {
  if (!validIndex(s, index)) return s;
  const out = s.map((x, i) => (i === index
    ? withStrokes(withSteps({ ...x, mode, detected: false }, mode === 'foot' ? x.steps : undefined), mode === 'row' ? x.strokeTimes : undefined)
    : x));
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
  if (sec.mode === mode) return s;
  if (!Number.isInteger(pointIndex) || pointIndex < 1 || pointIndex > sec.points.length - 2) return s;
  const headPoints = sec.points.slice(0, pointIndex + 1);
  const tailPoints = sec.points.slice(pointIndex);
  const [headSteps, tailSteps] = splitStepsByDistance(sec.steps, summarize(headPoints).distanceM, summarize(tailPoints).distanceM);
  const splitT = sec.points[pointIndex].t;
  const headStrokes = sec.strokeTimes?.filter((t) => t <= splitT);
  const tailStrokes = sec.strokeTimes?.filter((t) => t > splitT);
  const head = withStrokes(withSteps({ ...sec, points: headPoints }, headSteps), headStrokes);
  const tail = withStrokes(withSteps<LocalSection>({ mode, detected: false, points: tailPoints }, mode === 'foot' ? tailSteps : undefined), mode === 'row' ? tailStrokes : undefined);
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
  return s.map((sec, i) => {
    const t: TrackSection = {
      mode: sec.mode,
      detected: sec.detected,
      startedAt: new Date(sec.points[0]?.t ?? 0).toISOString(),
      endedAt: new Date(sec.points[sec.points.length - 1]?.t ?? 0).toISOString(),
      distanceM: summarize(sec.points).distanceM,
      pointsPath: `trips/${tripKey}/track-points/${i}`,
    };
    return { ...t, ...sectionFigures(sec) };
  });
}

/** The activity figures of a section (spec 1.122): steps on foot, splits on row; only defined keys. */
export function sectionFigures(sec: LocalSection): {
  steps?: number; splitAvgS?: number; splitBestS?: number; strokes?: number; strokeRateAvg?: number; strokeRateMax?: number;
} {
  if (sec.mode === 'foot') return sec.steps === undefined ? {} : { steps: sec.steps };
  if (sec.mode === 'row') return { ...rowSplits(sec.points), ...strokeFigures(sec.strokeTimes ?? []) };
  return {};
}
