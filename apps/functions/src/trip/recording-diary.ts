import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

import { TRACKER_TRIP_TYPE, TripCollection, type TripModel } from '@okr/shared-models';

import { resolveDiaryPulls, type PullResult } from '../diary/diary-pull';

/**
 * Does this write attach the recording to diaries (spec 1.77 §12.9)? Only when its doc is created: a detach from the
 * diary is itself a write, and a later trigger could not tell it from a recording not attached yet. Crew copies are
 * born in their diary tenants. Pure.
 */
export function shouldAttachOnWrite(before: TripModel | undefined, after: TripModel | undefined): boolean {
  return !before && after?.type === TRACKER_TRIP_TYPE && !after.track?.copyOf && !!after.track?.personKey && !!after.tenants?.[0];
}

/** The diary tenants a recording does not have yet. Pure. */
export function diaryTenantsToAdd(rec: Pick<TripModel, 'tenants'>, pulls: PullResult[]): string[] {
  return pulls.filter((p) => p.status === 'ok' && !(rec.tenants ?? []).includes(p.tenantId)).map((p) => p.tenantId);
}

/**
 * Adds tenants to a recording and its `track-points`. arrayUnion keeps `tenants[0]`, the recording's own tenant, which
 * the cleanup passes rely on. The diary reads the trip doc; the points follow for consistency, reads are gated by the
 * owner on the trip.
 */
export async function addDiaryTenants(db: Firestore, tripId: string, tenants: string[]): Promise<void> {
  const ref = db.collection(TripCollection).doc(tripId);
  await ref.update({ tenants: FieldValue.arrayUnion(...tenants) });
  const points = await ref.collection('track-points').listDocuments();
  for (let i = 0; i < points.length; i += 400) {
    const batch = db.batch();
    points.slice(i, i + 400).forEach((d) => batch.update(d, { tenants: FieldValue.arrayUnion(...tenants) }));
    await batch.commit();
  }
}

/**
 * The attach half of onTripWrite. Never throws: the stats work must not be affected. A failure is logged, not retried:
 * the recording stays in its own app (accepted limit, spec 1.77 §12.9).
 */
export async function handleRecordingAttach(before: TripModel | undefined, after: TripModel | undefined, tripId: string): Promise<void> {
  try {
    if (!after || !shouldAttachOnWrite(before, after)) return;
    const db = getFirestore();
    const pulls = await resolveDiaryPulls(db, {
      personKey: after.track?.personKey ?? '', sourceTenant: after.tenants?.[0] ?? '', source: 'tracker', date: after.startDate,
    });
    const tenants = diaryTenantsToAdd(after, pulls);
    if (tenants.length === 0) return;
    await addDiaryTenants(db, tripId, tenants);
    logger.info(`onTripWrite: recording attached trip=${tripId} tenants=[${tenants.join(', ')}]`);
  } catch (error) {
    logger.error(`onTripWrite: recording attach failed trip=${tripId}`, error);
  }
}
