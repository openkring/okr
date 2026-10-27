import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

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
import {
  resolveDiaryTargets,
  TRACKER_TRIP_TYPE,
  TripCollection,
  UserCollection,
  type DiaryTarget,
  type TrackSection,
  type TripModel,
  type TripTrack,
} from '@okr/shared-models';
import { crewTrackDeadline, formatTripTime } from '@okr/trip-util';

import { pickDiaryAuthor } from '../diary/diary-transfer';
import { pushToPersons } from '../srv/push';
import { TIME_FMT, toStoreDate } from '../srv/zurich-time';

/** The longest stretch of a recording a crew member can get, however the Logbuch times were edited (spec 1.123 §5.3). */
export const CREW_TRACK_MAX_SPAN_MS = 12 * 3_600_000;

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
  if (!logbuch || logbuch.type !== 'logbuch' || !logbuch.trackKey || logbuch.deletedAt) return 'none';
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

/**
 * The recording behind a Logbuch `trackKey` is only trusted when it points back (trackKey is client-writable) and its
 * recorder is on the Logbuch crew (spec §1) - a forged link cannot pull a stranger's recording into a crew. Pure.
 */
export function isLinkedRecording(
  rec: Pick<TripModel, 'type' | 'tenants' | 'isArchived' | 'deletedAt' | 'track'> | undefined,
  logbuch: Pick<TripModel, 'participants'>,
  logbuchKey: string,
  tenantId: string,
): boolean {
  return (
    !!rec &&
    rec.type === TRACKER_TRIP_TYPE &&
    !!rec.track &&
    rec.track.logbuchKey === logbuchKey &&
    isCrewMember(logbuch, rec.track.personKey ?? '') &&
    (rec.tenants ?? []).includes(tenantId) &&
    !rec.isArchived &&
    !rec.deletedAt
  );
}

/** Logbuch window, with the upper bound capped at CREW_TRACK_MAX_SPAN_MS after the lower one. Pure. */
export function crewWindowMs(logbuch: TripModel, recordingEndMs: number): { fromMs: number; toMs: number } {
  const { fromMs, toMs } = logbuchWindowMs(logbuch, recordingEndMs);
  return { fromMs, toMs: Math.min(toMs, fromMs + CREW_TRACK_MAX_SPAN_MS) };
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
export async function loadClippedTrack(db: Firestore, logbuch: TripModel, logbuchKey: string, tenantId: string): Promise<LocalSection[] | undefined> {
  if (!logbuch.trackKey) return undefined;
  const rec = await db.collection(TripCollection).doc(logbuch.trackKey).get();
  const recData = rec.data() as TripModel | undefined;
  if (!rec.exists || !recData || !isLinkedRecording(recData, logbuch, logbuchKey, tenantId) || !recData.track) return undefined;

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
  const { fromMs, toMs } = crewWindowMs(logbuch, recordingEndMs);
  return clipSections(sections, fromMs, toMs);
}

/*----------------------------- trips trigger: pushes and diary copies (spec 1.123 §4.1, §4.4, §6) -----------------*/

export type CrewTrackAction = 'requestPush' | 'stopPush' | 'copies';

const LOGBUCH_TRIP_TYPE = 'logbuch';

/** The boat is out ('open' or a revised 'open.rev'); mirrors isTripOpen in @okr/trip-util. */
function isOpen(t: Pick<TripModel, 'state'> | undefined): boolean {
  return (t?.state ?? '').startsWith('open');
}

/** A Logbuch trip that ended normally ('closed', 'closed.rev') and is not deleted or archived. Pure. */
export function isLogbuchEnded(t: Pick<TripModel, 'type' | 'state' | 'deletedAt' | 'isArchived'> | undefined): boolean {
  return !!t && t.type === LOGBUCH_TRIP_TYPE && (t.state ?? '').startsWith('closed') && !t.deletedAt && !t.isArchived;
}

/**
 * What the trips trigger has to do for one write (pure). Deletes (no `after`, incl. the day-7 cleanup) and crew
 * copies (`track.copyOf`) never act - a copy carries no `logbuchKey`, so a copy can never trigger another one.
 * - requestPush: an open Logbuch trip got a (new) `trackRequest` for a crew member and has no recording linked yet.
 * - stopPush: the Logbuch trip left 'open' with a recording linked; the caller pushes only while the recording
 *   is not uploaded yet.
 * - copies: the Logbuch trip ended with a recording (or got one linked after the end), or a recording linked to
 *   a Logbuch trip was uploaded / newly linked; the caller checks that the Logbuch trip has ended.
 */
export function crewTrackActions(before?: TripModel, after?: TripModel): CrewTrackAction[] {
  if (!after || after.track?.copyOf || after.deletedAt || after.isArchived) return [];

  if (after.type === TRACKER_TRIP_TYPE) {
    const key = after.track?.logbuchKey;
    return key && before?.track?.logbuchKey !== key ? ['copies'] : [];
  }
  if (after.type !== LOGBUCH_TRIP_TYPE) return [];

  const out: CrewTrackAction[] = [];
  const carrier = after.trackRequest?.personKey ?? '';
  if (carrier && isCrewMember(after, carrier) && !after.trackKey && isOpen(after) && before?.trackRequest?.personKey !== carrier) {
    out.push('requestPush');
  }
  // any end counts, 'deleted' too (on purpose: the boat is back, stop recording) - unlike copies, which need 'closed*'
  if (after.trackKey && before && isOpen(before) && !isOpen(after)) out.push('stopPush');
  if (after.trackKey && isLogbuchEnded(after) && (!isLogbuchEnded(before) || before?.trackKey !== after.trackKey)) {
    out.push('copies');
  }
  return out;
}

export interface CrewPush {
  title: string;
  body: string;
  url: string;
  type: 'trackRequest' | 'trackStop';
}

/** German texts (no server-side i18n; like the task pushes). The app name is prefixed by pushToPersons. Pure. */
export const crewPushTexts = {
  request(logbuch: TripModel): CrewPush {
    const boat = logbuch.resource?.name1 ?? '';
    const time = formatTripTime(logbuch.startTime ?? '');
    return {
      title: `Logbuch: ${[boat, time].filter((x) => x !== '').join(', ')}`,
      body: 'Strecke aufzeichnen?',
      url: `/tracker?logbuch=${logbuch.okey}`,
      type: 'trackRequest',
    };
  },
  stop(): CrewPush {
    return { title: 'Ausfahrt beendet', body: 'Aufzeichnung stoppen?', url: '/tracker', type: 'trackStop' };
  },
};

/** The slice of a `users/{uid}` doc the diary routing needs. */
export interface CrewUser {
  id: string;
  tenants?: string[];
  isArchived?: boolean;
  diaryTargets?: DiaryTarget[];
}

/**
 * Pure half of crewDiaryTenants: the person's user in the source (club) tenant decides via `diaryTargets`
 * (source 'tracker'); the club tenant itself never gets a copy, nor a diary tenant without an active user of
 * the person (the copy would be invisible there). uid = the author in the first diary tenant.
 */
export function selectCrewDiaryTarget(
  users: CrewUser[],
  sourceTenant: string,
  date: string,
): { tenants: string[]; uid: string } | undefined {
  const source = users.find((u) => u.isArchived !== true && (u.tenants ?? []).includes(sourceTenant));
  if (!source) return undefined;
  const tenants = resolveDiaryTargets(source.diaryTargets, 'tracker', date)
    .filter((t) => t !== sourceTenant && pickDiaryAuthor(users, t) !== undefined);
  if (tenants.length === 0) return undefined;
  const uid = pickDiaryAuthor(users, tenants[0]);
  return uid ? { tenants, uid } : undefined;
}

/**
 * The diary tenants (and the owner uid) a crew copy goes to; undefined = no copy.
 * THE SINGLE SWAP POINT for spec 1.77 §12: today it reads the push model (`users.diaryTargets` of the person's user in
 * the club tenant); when the §12 pull model ships (diarySources + diaryConsents), only this function changes.
 */
export async function crewDiaryTenants(
  db: Firestore,
  personKey: string,
  sourceTenant: string,
  date: string,
): Promise<{ tenants: string[]; uid: string } | undefined> {
  if (!personKey) return undefined;
  const snap = await db.collection(UserCollection).where('personKey', '==', personKey).get();
  const users: CrewUser[] = snap.docs.map((d) => ({
    id: d.id,
    tenants: d.get('tenants') as string[] | undefined,
    isArchived: d.get('isArchived') as boolean | undefined,
    diaryTargets: d.get('diaryTargets') as DiaryTarget[] | undefined,
  }));
  return selectCrewDiaryTarget(users, sourceTenant, date);
}

/** One section's points of a copy, same shape as the tracker's TrackPointsDoc. */
export interface CrewPointsDoc {
  tenants: string[];
  section: number;
  mode: LocalSection['mode'];
  count: number;
  encoded: string;
  strokeTimes?: string;
}

export interface CrewCopy {
  id: string;
  trip: Omit<TripModel, 'okey'>;
  points: CrewPointsDoc[];
}

/** 'HH:mm' Zurich wall clock. */
function zurichTime(d: Date): string {
  return TIME_FMT.format(d).slice(0, 5);
}

/**
 * The crew copy of a clipped recording (pure): an independent tracker trip owned by `personKey`, in its diary
 * tenants only. Figures follow toCrewSections (no steps, no heart rate); no photos, no notes, no logbuchKey.
 * undefined when nothing is left after clipping.
 */
export function buildCrewCopy(args: {
  logbuch: TripModel;
  recordingKey: string;
  personKey: string;
  uid: string;
  tenants: string[];
  clipped: LocalSection[];
}): CrewCopy | undefined {
  const { logbuch, recordingKey, personKey, uid, tenants, clipped } = args;
  if (clipped.length === 0) return undefined;
  const id = `${recordingKey}_${personKey}`;
  const crew = toCrewSections(clipped);
  // a loop, not Math.min(...all points): a long 1 Hz recording has more points than a call can take as arguments
  let startMs = Infinity;
  let endMs = -Infinity;
  for (const s of clipped) {
    for (const p of s.points) {
      if (p.t < startMs) startMs = p.t;
      if (p.t > endMs) endMs = p.t;
    }
  }

  const sections: TrackSection[] = crew.map((c, i) => {
    const pts = clipped[i].points;
    const s: TrackSection = {
      mode: c.mode,
      detected: false,
      startedAt: new Date(pts[0].t).toISOString(),
      endedAt: new Date(pts[pts.length - 1].t).toISOString(),
      distanceM: c.distanceM,
      pointsPath: `${TripCollection}/${id}/track-points/${i}`,
    };
    if (c.splitAvgS !== undefined) s.splitAvgS = c.splitAvgS;
    if (c.splitBestS !== undefined) s.splitBestS = c.splitBestS;
    if (c.strokes !== undefined) s.strokes = c.strokes;
    if (c.strokeRateAvg !== undefined) s.strokeRateAvg = c.strokeRateAvg;
    if (c.strokeRateMax !== undefined) s.strokeRateMax = c.strokeRateMax;
    return s;
  });
  const points: CrewPointsDoc[] = crew.map((c, i) => {
    const doc: CrewPointsDoc = { tenants, section: i, mode: c.mode, count: clipped[i].points.length, encoded: c.encoded };
    if (c.strokeTimes) doc.strokeTimes = c.strokeTimes;
    return doc;
  });

  const track: TripTrack = {
    personKey,
    ownerUid: uid,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    durationS: Math.max(0, Math.round((endMs - startMs) / 1000)),
    sections,
    photos: [],
    copyOf: recordingKey,
  };
  const start = new Date(startMs);
  const end = new Date(endMs);
  const startDate = toStoreDate(start);
  const totalM = crew.reduce((m, c) => m + c.distanceM, 0);
  const trip: Omit<TripModel, 'okey'> = {
    tenants,
    isArchived: false,
    name: logbuch.name,
    type: TRACKER_TRIP_TYPE,
    index: `d:${startDate}`,
    tags: '',
    notes: '',
    startDate,
    startTime: zurichTime(start),
    endDate: toStoreDate(end),
    endTime: zurichTime(end),
    locations: [],
    customLocationLabel: '',
    distance: Math.round(totalM / 100) / 10,
    participants: [],
    state: 'done',
    track,
  };
  // Firestore rejects undefined values: the boat only when the Logbuch trip has one
  if (logbuch.resource) trip.resource = logbuch.resource;
  return { id, trip, points };
}

/** gRPC ALREADY_EXISTS - the copy was made before (create() on an existing doc). */
const ALREADY_EXISTS = 6;

/**
 * One copy per crew member except the recorder (spec 1.123 §6), from the clipped, link-checked recording.
 * `logbuch.okey` and `recording.okey` must be set. A copy that exists is skipped (create()), so repeated calls are
 * safe. Never throws for one member; returns the number of copies written.
 */
export async function copyForCrew(db: Firestore, logbuch: TripModel, recording: TripModel): Promise<number> {
  const tenantId = logbuch.tenants?.[0];
  if (!tenantId || logbuch.trackKey !== recording.okey) return 0;
  const clipped = await loadClippedTrack(db, logbuch, logbuch.okey, tenantId);
  if (!clipped || clipped.length === 0) return 0;

  const recorder = recording.track?.personKey ?? '';
  const crew = [...new Set((logbuch.participants ?? []).map((p) => p.key).filter((k) => k && k !== recorder))];
  let written = 0;
  for (const personKey of crew) {
    try {
      const target = await crewDiaryTenants(db, personKey, tenantId, logbuch.startDate);
      if (!target) continue;
      const copy = buildCrewCopy({ logbuch, recordingKey: recording.okey, personKey, uid: target.uid, tenants: target.tenants, clipped });
      if (!copy) continue;
      const ref = db.collection(TripCollection).doc(copy.id);
      const batch = db.batch();
      batch.create(ref, copy.trip);
      copy.points.forEach((p, i) => batch.set(ref.collection('track-points').doc(String(i)), p));
      await batch.commit();
      written++;
    } catch (error) {
      if ((error as { code?: number }).code === ALREADY_EXISTS) continue;
      logger.error(`copyForCrew: copy failed recording=${recording.okey} person=${personKey}`, error);
    }
  }
  return written;
}

/**
 * The crew-track half of onTripWrite. Never throws: errors are logged, the stats work is not affected.
 */
export async function handleCrewTrack(before: TripModel | undefined, after: TripModel | undefined, tripId: string): Promise<void> {
  try {
    const actions = crewTrackActions(before, after);
    if (!after || actions.length === 0) return;
    const tenantId = after.tenants?.[0];
    if (!tenantId) return;
    const db = getFirestore();
    const trip = { ...after, okey: tripId } as TripModel;

    if (trip.type === TRACKER_TRIP_TYPE) {
      const logbuchKey = trip.track?.logbuchKey ?? '';
      const snap = await db.collection(TripCollection).doc(logbuchKey).get();
      const logbuch = snap.exists ? ({ ...(snap.data() as TripModel), okey: logbuchKey }) : undefined;
      if (!isLogbuchEnded(logbuch) || !logbuch || logbuch.trackKey !== tripId) return;
      const n = await copyForCrew(db, logbuch, trip);
      logger.info(`onTripWrite: crew copies=${n} recording=${tripId} logbuch=${logbuchKey}`);
      return;
    }

    if (actions.includes('requestPush') && trip.trackRequest?.personKey) {
      const p = crewPushTexts.request(trip);
      const r = await pushToPersons([trip.trackRequest.personKey], { ...p, tenantId, channelId: `trackRequest_${tripId}` }, 'onTripWrite');
      logger.info(`onTripWrite: trackRequest sent=${r.sent} trip=${tripId}`);
    }
    if (!trip.trackKey || (!actions.includes('stopPush') && !actions.includes('copies'))) return;

    const recSnap = await db.collection(TripCollection).doc(trip.trackKey).get();
    if (actions.includes('stopPush') && !recSnap.exists && trip.trackRequest?.personKey) {
      const p = crewPushTexts.stop();
      const r = await pushToPersons([trip.trackRequest.personKey], { ...p, tenantId, channelId: `trackStop_${tripId}` }, 'onTripWrite');
      logger.info(`onTripWrite: trackStop sent=${r.sent} trip=${tripId}`);
    }
    if (actions.includes('copies') && recSnap.exists) {
      const recording = { ...(recSnap.data() as TripModel), okey: trip.trackKey };
      const n = await copyForCrew(db, trip, recording);
      logger.info(`onTripWrite: crew copies=${n} recording=${trip.trackKey} logbuch=${tripId}`);
    }
  } catch (error) {
    logger.error(`onTripWrite: crew track failed trip=${tripId}`, error);
  }
}
