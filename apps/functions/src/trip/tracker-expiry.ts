import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { TRACKER_TRIP_TYPE, TripCollection, type TripModel } from '@okr/shared-models';
import { crewTrackDeadline } from '@okr/trip-util';

import { toStoreDate } from '../srv/zurich-time';
import { deleteRecording } from './crew-track';
import { expiringTenants } from './expiring-tenants';

/**
 * The last day a recording stays: its end (Zurich date), else its start, + CREW_TRACK_DAYS. '' when neither is readable
 * (then only the trip's own startDate is left; none at all = never, logged by the caller). Pure.
 */
export function recordingExpiry(rec: Pick<TripModel, 'track' | 'startDate'>): string {
  const ms = Date.parse(rec.track?.endedAt || rec.track?.startedAt || '');
  if (Number.isFinite(ms)) return crewTrackDeadline({ endDate: toStoreDate(new Date(ms)) });
  return rec.startDate ? crewTrackDeadline({ endDate: rec.startDate }) : '';
}

/**
 * Delete or keep one tracker trip (spec 1.123 §7a). Kept for good: a diary pulled it (a tenant besides the recording's
 * own, tenants[0]) or it is attached to a journal. A crew copy lives in diary tenants only and never reaches here.
 * Past its own deadline, a recording that names a Logbuch trip is 'logbuch': the caller deletes it only when that trip
 * no longer points back (else the Logbuch pass owns it, its deadline can be later). Pure.
 */
export function expiryDecision(
  rec: Pick<TripModel, 'type' | 'tenants' | 'track' | 'startDate'>,
  expiringTenants: Set<string>,
  today: string,
): 'delete' | 'keep' | 'logbuch' {
  if (rec.type !== TRACKER_TRIP_TYPE) return 'keep';
  const own = rec.tenants?.[0] ?? '';
  if (!expiringTenants.has(own)) return 'keep';
  if (rec.track?.journalKey || (rec.tenants ?? []).some((t) => t !== own)) return 'keep';
  const deadline = recordingExpiry(rec);
  if (deadline === '' || today <= deadline) return 'keep';
  return rec.track?.logbuchKey ? 'logbuch' : 'delete';
}

/**
 * Nightly, after runCrewTrackCleanup: deletes every recording of a club app 7 days after its end unless a diary or a
 * journal holds it, so the club app is no archive for one's own tracks (spec 1.123 §7a). Fail-safe: a tenant whose
 * app-config cannot be read never expires anything.
 */
export async function runTrackerExpiry(now: Date = new Date()): Promise<void> {
  const db = getFirestore();
  const today = toStoreDate(now);
  const expiring = await expiringTenants(db);
  const snap = await db.collection(TripCollection).where('type', '==', TRACKER_TRIP_TYPE).get();
  let deleted = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const rec = { ...(doc.data() as TripModel), okey: doc.id } as TripModel;
    const decision = expiryDecision(rec, expiring, today);
    if (decision === 'keep') continue;
    try {
      if (decision === 'logbuch') {
        const logbuch = await db.collection(TripCollection).doc(rec.track?.logbuchKey ?? '').get();
        if (logbuch.exists && logbuch.get('trackKey') === doc.id) continue; // the Logbuch pass decides
      }
      await deleteRecording(db, rec);
      deleted++;
    } catch (error) {
      failed++;
      logger.error(`trackerExpiry: failed trip=${doc.id}`, error);
    }
  }
  logger.info(`trackerExpiry: tenants=[${[...expiring].join(', ')}] tracker=${snap.size} deleted=${deleted} failed=${failed}`);
}
