import { CREW_TRACK_DAYS, type TripModel } from '@okr/shared-models';

import type { CrewTrackSection } from './crew-track.model';
import { decodeTrack } from './track-polyline.util';
import type { LocalSection } from './track-sections.util';
import { decodeStrokeTimes, strokeTimesBase } from './track-strokes.util';
import { localStoreDate } from './track-photos.util';

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
