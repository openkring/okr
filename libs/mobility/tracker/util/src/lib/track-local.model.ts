import type { AvatarInfo, TrackPhoto, TransportMode } from '@okr/shared-models';
import type { TrackPoint } from './track-polyline.util';

/** A track as held in the device's local store (recording, paused or finished; uploaded or not). */
export interface LocalTrack {
  key: string;
  state: 'recording' | 'paused' | 'done';
  uploaded: boolean;
  name: string;
  startedAt: number;
  endedAt?: number;
  sections: { mode: TransportMode; detected: boolean; steps?: number }[]; // steps: foot only (spec 1.122)
  /**
   * Set by a correction that reduced the number of sections: track-points docs with an index from
   * sections.length up to this bound (exclusive) may still exist uploaded and are deleted in the next upload's batch.
   */
  extraPointsUpTo?: number;
  /** Correction counter: +1 on every correction or rename (missing on old rows = 0). */
  rev?: number;
  /** Photos placed on the track; `path400` is the device-local rendition and is never uploaded. */
  photos?: (TrackPhoto & { path400?: string })[];
  /** Every visible photo's thumbnail is uploaded and the trip's photo list carries its thumbPath (missing = false). */
  photosUploaded?: boolean;
  /** The photo-library access the photos were last searched with; 'limited' = a later search may find more. */
  photosAccess?: 'full' | 'limited';
  /**
   * The next free thumbnail number (`{n}.jpg`): numbers only grow, so a merged-in photo never takes the file of
   * another one and a detached delete of a hidden photo's file never hits a newer upload (missing = derive, see nextThumbNumber).
   */
  thumbSeq?: number;
  /**
   * The Logbuch trip (trips/{okey}) this recording is linked to, or is about to be (spec 1.123 §4). Uploaded as
   * `track.logbuchKey` only once `logbuchLinked` is true; a track without it uploads a deleted `track.logbuchKey`.
   */
  logbuchKey?: string;
  /** The link transaction on the Logbuch trip succeeded (its `trackKey` is this track). Missing = not yet. */
  logbuchLinked?: boolean;
  /** The boat of the Logbuch trip; uploaded as the trip's `resource`. */
  resource?: AvatarInfo;
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
