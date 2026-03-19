/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';

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

export function checkAdminUser(request: functions.CallableRequest, nameOfCallingFunction: string): void {
  if (!request.auth?.token.admin) {
    logger.error(`${nameOfCallingFunction}: user ${request.auth?.uid} must be an admin`);
    throw new functions.HttpsError('permission-denied', 'impersonateUser can only be used by admin users.');
  }
}

export async function checkAdminClaim(request: functions.CallableRequest, nameOfCallingFunction: string): Promise<void> {
  if (!request.auth?.uid) {
    logger.error(`${nameOfCallingFunction}: uid is mandatory`);
  } else {
    const caller = await getAuth().getUser(request.auth.uid);

    if (!caller.customClaims?.admin) {
      logger.error(`${nameOfCallingFunction}: user ${request.auth?.uid} must be an admin`);
      throw new functions.HttpsError('permission-denied', 'Only admins can create users');
    }
  }
}

export function checkStringField(request: functions.CallableRequest, nameOfCallingFunction: string, fieldName: string): string {
    const data = request.data[fieldName];
  if (!data || typeof data !== 'string') {
    logger.error(`${nameOfCallingFunction}: invalid ${fieldName} <${data}> provided`);
    throw new functions.HttpsError('invalid-argument', `${nameOfCallingFunction} must be called with a valid ${fieldName}.`);
  }
  return data;
}
