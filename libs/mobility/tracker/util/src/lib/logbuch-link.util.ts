import type { TripModel } from '@okr/shared-models';
import { logbuchWindowMs } from './track-clip.util';
import type { LocalTrack } from './track-local.model';

/**
 * Linking a recording to a Logbuch trip (spec 1.123 §4). Pure helpers: no Angular, no @okr/trip-util (this lib is
 * bundled into Cloud Functions as well).
 */

const LOGBUCH = 'logbuch';

/** The preset the tracker offers before Start: no Logbuch trip, exactly one (preselected), or a choice. */
export type LogbuchPreset = { kind: 'none' } | { kind: 'one'; trip: TripModel } | { kind: 'many'; trips: TripModel[] };

/** The person is on the trip's crew (`participants[].key`); an empty person key never is. */
export function isLogbuchCrew(trip: Pick<TripModel, 'participants'>, personKey: string): boolean {
  return personKey !== '' && (trip.participants ?? []).some((p) => p.key === personKey);
}

/** A Logbuch trip that still counts: not soft-deleted, archived or in state 'deleted'. */
function isLiveLogbuch(trip: TripModel): boolean {
  return trip.type === LOGBUCH && !trip.deletedAt && !trip.isArchived && trip.state !== 'deleted';
}

function isOpen(trip: TripModel): boolean {
  return (trip.state ?? '').startsWith('open');
}

function isClosed(trip: TripModel): boolean {
  return (trip.state ?? '').startsWith('closed');
}

/** 'HHmm' and 'HH:mm' sort alike. */
function timeKey(trip: TripModel): string {
  return (trip.startTime ?? '').replace(/\D/g, '').padStart(4, '0');
}

/**
 * Today's open Logbuch trips of the person (spec §4.2): one → preselected, several → a choice (earliest first),
 * none → an unlinked recording. Closed trips and trips without the person are ignored.
 */
export function pickLogbuchPreset(trips: TripModel[], personKey: string): LogbuchPreset {
  const mine = trips
    .filter((t) => isLiveLogbuch(t) && isOpen(t) && isLogbuchCrew(t, personKey))
    .sort((a, b) => timeKey(a).localeCompare(timeKey(b)));
  if (mine.length === 0) return { kind: 'none' };
  if (mine.length === 1) return { kind: 'one', trip: mine[0] };
  return { kind: 'many', trips: mine };
}

/**
 * Logbuch trips a finished recording can be linked to afterwards: open or ended trips of the person whose Logbuch
 * window (start - margin .. end + margin, or the recording end for an open trip) overlaps the recording.
 * The deadline (end + CREW_TRACK_DAYS) is checked by the caller.
 */
export function logbuchLinkCandidates(trips: TripModel[], personKey: string, startedAtMs: number, endedAtMs: number): TripModel[] {
  return trips
    .filter((t) => isLiveLogbuch(t) && (isOpen(t) || isClosed(t)) && isLogbuchCrew(t, personKey))
    .filter((t) => {
      const { fromMs, toMs } = logbuchWindowMs(t, endedAtMs);
      return fromMs <= endedAtMs && toMs >= startedAtMs;
    })
    .sort((a, b) => timeKey(a).localeCompare(timeKey(b)));
}

/** The track without its Logbuch link (key and linked flag); the boat stays. */
export function withoutLogbuchLink(t: LocalTrack): LocalTrack {
  const out: LocalTrack = { ...t };
  delete out.logbuchKey;
  delete out.logbuchLinked;
  return out;
}

/** A recording waiting for its link transaction (offline at start): retried before the upload. */
export function hasPendingLogbuchLink(t: LocalTrack): boolean {
  return !!t.logbuchKey && !t.logbuchLinked;
}
