import { CREW_TRACK_DAYS, type TripModel } from '@okr/shared-models';

import type { CrewTrackSection } from './crew-track.model';
import { decodeTrack } from './track-polyline.util';
import type { LocalSection } from './track-sections.util';
import { decodeStrokeTimes, strokeTimesBase } from './track-strokes.util';
import { localStoreDate } from './track-photos.util';
import { isLogbuchCrew, logbuchTripLabel } from './logbuch-link.util';

/**
 * The crew track's sections as returned by `getLogbuchTrack` (spec 1.123 §5.2) in the local shape `buildGpx` and the
 * map take: points decoded, stroke times decoded against the section's first point. Never detected (the crew sees
 * the recorder's final sections); `strokeTimes` only when the section has any.
 */
export function crewToLocalSections(sections: CrewTrackSection[]): LocalSection[] {
  return sections.map((s) => {
    const points = decodeTrack(s.encoded);
    const out: LocalSection = { mode: s.mode, detected: false, points };
    if (s.strokeTimes) out.strokeTimes = decodeStrokeTimes(s.strokeTimes, strokeTimesBase(points));
    return out;
  });
}

/** A StoreDate (yyyymmdd) plus CREW_TRACK_DAYS, like `crewTrackDeadline` of `@okr/trip-util`. Pure. */
function plusCrewDays(storeDate: string): string {
  const end = Date.UTC(Number(storeDate.slice(0, 4)), Number(storeDate.slice(4, 6)) - 1, Number(storeDate.slice(6, 8)));
  return new Date(end + CREW_TRACK_DAYS * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * The last day a club-app recording nobody kept stays on the server (spec 1.123 §7/§7a); the nightly cleanup deletes it
 * the night after. Mirrors `apps/functions/src/trip`: the recording's own end + CREW_TRACK_DAYS, and for a linked one
 * the later of that and the Logbuch end + CREW_TRACK_DAYS. '' while a linked Logbuch trip has no end date yet (the date
 * can still move), so the caller shows the generic wording. Pure.
 */
export function recordingDeleteDate(logbuch: Pick<TripModel, 'endDate'> | undefined, endedAtMs: number | undefined, linked: boolean): string {
  const own = endedAtMs !== undefined && Number.isFinite(endedAtMs) ? plusCrewDays(localStoreDate(endedAtMs)) : '';
  if (!linked) return own;
  if (!logbuch?.endDate) return '';
  const logbuchDeadline = plusCrewDays(logbuch.endDate);
  return own > logbuchDeadline ? own : logbuchDeadline;
}

/** An app whose recordings expire after CREW_TRACK_DAYS: neither a diary nor a travel journal (spec 1.123 §7a). Pure. */
export function isExpiringApp(enabledFeatures: string[] | undefined): boolean {
  return !enabledFeatures?.includes('diary') && !enabledFeatures?.includes('journal');
}

/**
 * A recording its owner kept, so the cleanup leaves it alone: attached to a journal, or in a tenant other than
 * the app's own (the diary pull added it). Mirrors `expiryDecision` in `apps/functions/src/trip/tracker-expiry.ts`. Pure.
 */
export function isKeptRecording(trip: Pick<TripModel, 'tenants' | 'track'> | undefined, appTenant: string): boolean {
  return !!trip?.track?.journalKey || (trip?.tenants ?? []).some((t) => t !== appTenant);
}

/** One Logbuch trip whose route the crew member can open under «Strecken» (recorded by somebody else on the crew). */
export interface CrewRouteItem {
  /** okey of the LOGBUCH trip: the crew view reads the route through it */
  key: string;
  label: string;
  startDate: string;
  distanceKm: number;
  /** first name of the recorder, from the crew list; '' when unknown */
  recorderName: string;
}

/** Left by the end-of-day sweep on a trip nobody closed: no crew view (mirrors AUTO_CLOSED_STATE in apps/functions/src/trip). */
const AUTO_CLOSED_STATE = 'closed.rev';

/** First StoreDate a still-visible crew route can start on: today − CREW_TRACK_DAYS − 1 (one day slack for an overnight trip). Pure. */
export function crewRoutesFromDate(nowMs: number): string {
  return localStoreDate(nowMs - (CREW_TRACK_DAYS + 1) * 86_400_000);
}

/**
 * The Logbuch trips whose linked route the person may see as crew (spec 1.123 §5), newest first: a live, ended
 * Logbuch trip with a recording, the person on the crew, the deadline (end + CREW_TRACK_DAYS) not passed. Mirrors
 * `decideCrewAccess` in `apps/functions/src/trip/crew-track.ts`, which still decides. A trip whose `trackKey` is in
 * `ownRecordingKeys` is left out: the person recorded it, so the own recording is already in the list. Pure.
 */
export function crewRouteItems(trips: TripModel[], personKey: string, ownRecordingKeys: ReadonlySet<string>, today: string): CrewRouteItem[] {
  return trips
    .filter((t) =>
      !!t.okey && t.type === 'logbuch' && !!t.trackKey && !t.deletedAt && !t.isArchived && t.state !== 'deleted' &&
      !(t.state ?? '').startsWith('open') && t.state !== AUTO_CLOSED_STATE && !!t.endDate && today <= plusCrewDays(t.endDate) &&
      isLogbuchCrew(t, personKey) && !ownRecordingKeys.has(t.trackKey as string))
    .sort((a, b) => `${b.startDate}${timeDigits(b)}`.localeCompare(`${a.startDate}${timeDigits(a)}`))
    .map((t) => {
      const recorder = t.trackRequest?.personKey ?? '';
      return {
        key: t.okey as string,
        label: logbuchTripLabel(t),
        startDate: t.startDate,
        distanceKm: t.distance ?? 0,
        recorderName: recorder === '' ? '' : (t.participants.find((p) => p.key === recorder)?.name1 ?? ''),
      };
    });
}

function timeDigits(t: Pick<TripModel, 'startTime'>): string {
  return (t.startTime ?? '').replace(/\D/g, '').padStart(4, '0');
}
