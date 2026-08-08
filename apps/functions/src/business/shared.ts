// apps/functions/src/business/shared.ts
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { PartnerCollection } from '@okr/shared-models';
import type { PartnerModel } from '@okr/shared-models';
import { checkAuthentication } from '@okr/shared-util-functions';

export const REGION = 'europe-west6';

/** Everything the partner channel writes lives in the platform tenant (C3 §6). */
export const PLATFORM_TENANT = 'kring';

export function nowStamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Resolve the calling installation to a partner record.
 *
 * The identity is a uid recorded on the partner (`serviceUid`), not a `partner` role: this uid can
 * do exactly what these callables allow and nothing else, and it stays out of both the eight
 * billable roles (pricing §9.1) and every `isPrivileged()` branch in `firestore.rules`.
 *
 * This is also why the prospect pool is served by callables rather than by a Firestore rule (C5 §5):
 * "the open pool plus my own claims" is a predicate over document CONTENT, and a rule whose outcome
 * depends on content cannot be evaluated for a list query — the query is rejected wholesale, or, if
 * it is written to pass, it grants more than it looks like it grants.
 */
export async function requirePartner(request: CallableRequest, fnName: string): Promise<PartnerModel> {
  // NO App Check here, deliberately: the caller is the partner's scheduled Cloud Function (C3 §3),
  // and App Check attests *client apps* — there is no server attestation to obtain, so requiring it
  // would make the push impossible rather than safer. The credential is the service identity's ID
  // token, which bkaiser issues and can disable unilaterally.
  checkAuthentication(request, fnName);
  const uid = request.auth?.uid ?? '';
  const snap = await getFirestore().collection(PartnerCollection)
    .where('serviceUid', '==', uid).limit(1).get();
  if (snap.empty) {
    logger.error(`${fnName}: uid ${uid} is not a registered partner identity`);
    throw new HttpsError('permission-denied', 'Not a registered partner identity.');
  }
  const doc = snap.docs[0];
  return { ...(doc.data() as PartnerModel), okey: doc.id };
}

/** bkaiser's own back office. Distinct from `requirePartner` — a partner is never an admin. */
export async function requireAdmin(request: CallableRequest, fnName: string): Promise<void> {
  checkAuthentication(request, fnName);
  const uid = request.auth?.uid ?? '';
  const user = await getFirestore().collection('users').doc(uid).get();
  if ((user.data()?.['roles'] ?? {})['admin'] !== true) {
    throw new HttpsError('permission-denied', `${fnName} requires the admin role.`);
  }
}
