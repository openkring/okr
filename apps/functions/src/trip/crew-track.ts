import type { Firestore } from 'firebase-admin/firestore';

import {
  decodeStrokeTimes,
  decodeTrack,
  encodeStrokeTimes,
  encodeTrack,
  logbuchWindowMs,
  clipSections,
  sectionFigures,
  strokeTimesBase,
  summarize,
  type CrewTrackSection,
  type LocalSection,
} from '@okr/mobility-tracker-util';
import { TripCollection, type TripModel } from '@okr/shared-models';
import { crewTrackDeadline } from '@okr/trip-util';

export type CrewAccess = 'ok' | 'none' | 'denied' | 'gone';

/** Is the person on the Logbuch trip's crew? `participants[].key` is the person okey (AvatarInfo). */
export function isCrewMember(trip: Pick<TripModel, 'participants'>, personKey: string): boolean {
  return personKey !== '' && (trip.participants ?? []).some((p) => p.key === personKey);
}

/**
 * The callable's decision, in the spec's order: no logbuch / no link -> none; not crew -> denied;
 * deadline passed -> none; recording missing -> gone. `today` is a Zurich StoreDate; an open trip ('' deadline) never expires.
 */
export function decideCrewAccess(
  logbuch: TripModel | undefined,
  callerPersonKey: string,
  recordingExists: boolean,
  today: string,
): CrewAccess {
  if (!logbuch || logbuch.type !== 'logbuch' || !logbuch.trackKey) return 'none';
  if (!isCrewMember(logbuch, callerPersonKey)) return 'denied';
  const deadline = crewTrackDeadline(logbuch);
  if (deadline !== '' && today > deadline) return 'none';
  return recordingExists ? 'ok' : 'gone';
}

/** Recomputes every figure from the (clipped) points; steps and heart rate are never carried over. Pure. */
export function toCrewSections(sections: LocalSection[]): CrewTrackSection[] {
  return sections.map((s) => {
    const { distanceM, durationS } = summarize(s.points);
    const { splitAvgS, splitBestS, strokes, strokeRateAvg, strokeRateMax } = sectionFigures(s);
    const out: CrewTrackSection = { mode: s.mode, distanceM, durationS, encoded: encodeTrack(s.points) };
    if (splitAvgS !== undefined) out.splitAvgS = splitAvgS;
    if (splitBestS !== undefined) out.splitBestS = splitBestS;
    if (strokes !== undefined) out.strokes = strokes;
    if (strokeRateAvg !== undefined) out.strokeRateAvg = strokeRateAvg;
    if (strokeRateMax !== undefined) out.strokeRateMax = strokeRateMax;
    if (s.mode === 'row' && s.strokeTimes && s.strokeTimes.length > 0) {
      out.strokeTimes = encodeStrokeTimes(s.strokeTimes, strokeTimesBase(s.points));
    }
    return out;
  });
}

interface PointsDocData {
  mode: LocalSection['mode'];
  encoded: string;
  strokeTimes?: string;
}

/**
 * The linked recording's sections clipped to the Logbuch window; undefined when the recording trip is
 * missing or archived. Reads the owner-only docs with admin rights - only the clipped result leaves.
 */
export async function loadClippedTrack(db: Firestore, logbuch: TripModel): Promise<LocalSection[] | undefined> {
  if (!logbuch.trackKey) return undefined;
  const rec = await db.collection(TripCollection).doc(logbuch.trackKey).get();
  const recData = rec.data() as Pick<TripModel, 'isArchived' | 'track' | 'deletedAt'> | undefined;
  if (!rec.exists || !recData || recData.isArchived || recData.deletedAt || !recData.track) return undefined;

  const snap = await db.collection(TripCollection).doc(logbuch.trackKey).collection('track-points').get();
  const docs = snap.docs
    .map((d) => ({ n: Number(d.id), data: d.data() as PointsDocData }))
    .sort((a, b) => a.n - b.n);
  const sections: LocalSection[] = docs.map(({ data }) => {
    const points = decodeTrack(data.encoded);
    const s: LocalSection = { mode: data.mode, detected: false, points };
    if (data.strokeTimes) s.strokeTimes = decodeStrokeTimes(data.strokeTimes, strokeTimesBase(points));
    return s;
  });
  const endedMs = Date.parse(recData.track.endedAt);
  const lastPoint = sections.reduce((m, s) => Math.max(m, s.points[s.points.length - 1]?.t ?? 0), 0);
  const recordingEndMs = Number.isNaN(endedMs) ? lastPoint : endedMs;
  const { fromMs, toMs } = logbuchWindowMs(logbuch, recordingEndMs);
  return clipSections(sections, fromMs, toMs);
}
