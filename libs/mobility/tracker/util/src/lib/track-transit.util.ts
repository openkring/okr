import type { TransportMode } from '@okr/shared-models';
import type { TrackPoint } from './track-polyline.util';

/** Sections whose line can come from the timetable (spec 1.129 §4); drawn dashed while they have none. */
export const TRANSIT_MODES: readonly TransportMode[] = ['train', 'bus', 'ship'];

export function isTransitMode(mode: TransportMode): boolean {
  return TRANSIT_MODES.includes(mode);
}

/** Request of the `getTransitRoute` callable: a recorded train/bus/ship section, by its ends and times. */
export interface TransitRouteReq {
  mode: TransportMode;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  /** ISO timestamps of the section's first and last point */
  startedAt: string;
  endedAt: string;
}

/** Response of `getTransitRoute`: the line of the best fitting connection; no points = none found. */
export interface TransitRouteRes {
  points: { lat: number; lng: number }[];
  /** the line, e.g. «IR 35» or «Bus 2»; '' when unknown */
  line: string;
  attribution: { provider: string; url: string };
}

/** Identifies a section for a looked-up route: a correction that changes mode or ends needs a new one. */
export function transitRouteKey(s: { mode: TransportMode; points: TrackPoint[] }): string {
  const first = s.points[0];
  const last = s.points[s.points.length - 1];
  return first && last ? `${s.mode}|${first.t}|${last.t}` : '';
}

/** The request for a section; undefined when it is no transit section or has fewer than two points. */
export function transitRouteReq(s: { mode: TransportMode; points: TrackPoint[] }): TransitRouteReq | undefined {
  const first = s.points[0];
  const last = s.points[s.points.length - 1];
  if (!isTransitMode(s.mode) || s.points.length < 2 || !first || !last) return undefined;
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  return {
    mode: s.mode,
    from: { lat: round(first.lat), lng: round(first.lng) },
    to: { lat: round(last.lat), lng: round(last.lng) },
    startedAt: new Date(first.t).toISOString(),
    endedAt: new Date(last.t).toISOString(),
  };
}
