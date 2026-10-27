import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import type { GetLogbuchTrackRes } from '@okr/mobility-tracker-util';
import { TripCollection, UserCollection, type TripModel } from '@okr/shared-models';
import { crewTrackDeadline } from '@okr/trip-util';
import { checkAppCheckToken } from '@okr/shared-util-functions';

import { toStoreDate } from '../srv/zurich-time';
import { decideCrewAccess, loadClippedTrack, toCrewSections } from './crew-track';

export interface GetLogbuchTrackReq {
  tenantId: string;
  /** okey of the LOGBUCH trip (not of the recording) */
  tripKey: string;
}

/**
 * Returns the crew's view of the recording linked to a Logbuch trip (spec 1.123 §5.2): only the sections clipped to
 * the Logbuch window, only mode/figures/encoded points - never steps, heart rate, photos or notes. The caller must be
 * on the Logbuch crew (`participants`, by personKey); the recording itself stays owner-only.
 * The response name is the trip's own name.
 */
export const getLogbuchTrack = onCall<GetLogbuchTrackReq, Promise<GetLogbuchTrackRes>>(
  { region: 'europe-west6', memory: '256MiB', timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    checkAppCheckToken(request, 'getLogbuchTrack');
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'sign in first');
    const { tenantId, tripKey } = request.data ?? ({} as Partial<GetLogbuchTrackReq>);
    if (typeof tenantId !== 'string' || tenantId === '' || typeof tripKey !== 'string' || tripKey === '') {
      throw new HttpsError('invalid-argument', 'tenantId and tripKey required');
    }

    const db = getFirestore();
    const user = (await db.collection(UserCollection).doc(uid).get()).data() ?? {};
    const tenants = (user['tenants'] as string[] | undefined) ?? [];
    if (tenants[0] !== tenantId) throw new HttpsError('permission-denied', 'wrong tenant');
    const personKey = (user['personKey'] as string | undefined) ?? '';

    const snap = await db.collection(TripCollection).doc(tripKey).get();
    const trip = snap.exists ? (snap.data() as TripModel) : undefined;
    const sameTenant = trip !== undefined && !trip.isArchived && (trip.tenants ?? []).includes(tenantId);
    const logbuch = sameTenant ? trip : undefined;

    const today = toStoreDate(new Date());
    // the recording is only read once the earlier checks passed ('gone' needs it), so a stranger learns nothing
    const early = decideCrewAccess(logbuch, personKey, true, today);
    if (early !== 'ok' || !logbuch) return { state: early === 'ok' ? 'none' : early };

    const clipped = await loadClippedTrack(db, logbuch);
    if (decideCrewAccess(logbuch, personKey, clipped !== undefined, today) !== 'ok' || !clipped) return { state: 'gone' };
    return {
      state: 'ok',
      name: logbuch.name,
      deadline: crewTrackDeadline(logbuch),
      sections: toCrewSections(clipped),
    };
  },
);
