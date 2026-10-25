import type { TransportMode } from '@okr/shared-models';
import type { TrackPoint } from './track-polyline.util';

/** A track as held in the device's local store (recording, paused or finished; uploaded or not). */
export interface LocalTrack {
  key: string;
  state: 'recording' | 'paused' | 'done';
  uploaded: boolean;
  name: string;
  startedAt: number;
  endedAt?: number;
  sections: { mode: TransportMode; detected: boolean }[];
  /**
   * Set by a correction that reduced the number of sections: track-points docs with an index from
   * sections.length up to this bound (exclusive) may still exist uploaded and are deleted after the next upload.
   */
  extraPointsUpTo?: number;
}

/** A stored point row: a track point plus its section index. */
export interface PointRow {
  section: number;
  lat: number;
  lng: number;
  t: number;
  acc?: number | null;
}

/** Groups point rows by section index (ascending), each group ordered by t. Gaps in indices are kept as empty groups. */
export function groupPointsBySection(rows: PointRow[]): TrackPoint[][] {
  const groups: TrackPoint[][] = [];
  for (const r of rows) {
    const p: TrackPoint = { lat: r.lat, lng: r.lng, t: r.t };
    if (r.acc !== null && r.acc !== undefined) p.acc = r.acc;
    (groups[r.section] ??= []).push(p);
  }
  return Array.from(groups, (g) => (g ?? []).sort((a, b) => a.t - b.t));
}
