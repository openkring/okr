/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

export function checkAppCheckToken(request: functions.CallableRequest, nameOfCallingFunction: string): void {
  if (!request.app) {
    logger.error(`${nameOfCallingFunction}: App Check token missing or invalid`);
    throw new functions.HttpsError('failed-precondition', 'App Check verification failed.');
  }
}

export function checkAuthentication(request: functions.CallableRequest, nameOfCallingFunction: string): void {
  // Check if the user is authenticated
  if (!request.auth) {
    logger.error(`${nameOfCallingFunction}: user is not authenticated`);
    throw new functions.HttpsError('unauthenticated', 'user must be authenticated.');
  }
}

/**
 * Authorize an admin-only callable. The source of truth is the caller's
 * users/{uid} document `roles.admin` flag — the same model the client and the
 * Firestore rules use. A legacy `admin` custom claim is still accepted so that
 * already-provisioned admins are not locked out during the transition. (M-6 —
 * replaces the previous claim-only checkAdminUser/checkAdminClaim, which always
 * failed when no claim was minted.)
 */
export async function checkAdminRole(request: functions.CallableRequest, nameOfCallingFunction: string): Promise<void> {
  const uid = request.auth?.uid;
  if (!uid) {
    logger.error(`${nameOfCallingFunction}: user is not authenticated`);
    throw new functions.HttpsError('unauthenticated', 'user must be authenticated.');
  }
  if (request.auth?.token?.['admin'] === true) return;   // legacy custom claim
  const snap = await getFirestore().collection('users').doc(uid).get();
  const roles = snap.data()?.['roles'] as Record<string, boolean> | undefined;
  if (roles?.['admin'] === true) return;
  logger.error(`${nameOfCallingFunction}: user ${uid} must be an admin`);
  throw new functions.HttpsError('permission-denied', 'This operation requires the admin role.');
}

export function checkStringField(request: functions.CallableRequest, nameOfCallingFunction: string, fieldName: string): string {
    const data = request.data[fieldName];
  if (!data || typeof data !== 'string') {
    logger.error(`${nameOfCallingFunction}: invalid ${fieldName} <${data}> provided`);
    throw new functions.HttpsError('invalid-argument', `${nameOfCallingFunction} must be called with a valid ${fieldName}.`);
  }
  return data;
}
