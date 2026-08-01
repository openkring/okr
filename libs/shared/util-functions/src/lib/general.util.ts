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

/**
 * Authorize a callable for a set of roles. Like checkAdminRole, the source of
 * truth is the caller's users/{uid}.roles map; `admin` always passes. Added for
 * the SRV/bexio callables that previously required only authentication
 * (privacy inventory §7.2).
 */
export async function checkRoles(request: functions.CallableRequest, nameOfCallingFunction: string, allowedRoles: string[]): Promise<void> {
  const uid = request.auth?.uid;
  if (!uid) {
    logger.error(`${nameOfCallingFunction}: user is not authenticated`);
    throw new functions.HttpsError('unauthenticated', 'user must be authenticated.');
  }
  if (request.auth?.token?.['admin'] === true) return;   // legacy custom claim
  const snap = await getFirestore().collection('users').doc(uid).get();
  const roles = snap.data()?.['roles'] as Record<string, boolean> | undefined;
  if (roles?.['admin'] === true || allowedRoles.some((r) => roles?.[r] === true)) return;
  logger.error(`${nameOfCallingFunction}: user ${uid} lacks required role(s): ${allowedRoles.join(', ')}`);
  throw new functions.HttpsError('permission-denied', `This operation requires one of the roles: ${allowedRoles.join(', ')}.`);
}

/**
 * Pure derivation of the caller's tenant from their `users/{uid}` document data.
 * `UserModel.tenants` always holds exactly one tenant. Exported so it can be tested
 * without Firestore; call `getCallerTenantId` in production code.
 */
export function tenantIdOfUserData(userData: Record<string, unknown> | undefined): string {
  const tenants = Array.isArray(userData?.['tenants']) ? (userData['tenants'] as string[]) : [];
  const tenantId = tenants[0];
  return typeof tenantId === 'string' ? tenantId : '';
}

/**
 * The caller's own tenant, read server-side from `users/{uid}.tenants[0]` — never from
 * client-supplied data. Use this in any callable that would otherwise trust a `tenantId`
 * (or a tenant-derived name) in `request.data`: a client can send any string, so trusting
 * it turns a tenant-scoped resource into a cross-tenant one.
 */
export async function getCallerTenantId(request: functions.CallableRequest, nameOfCallingFunction: string): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) {
    logger.error(`${nameOfCallingFunction}: user is not authenticated`);
    throw new functions.HttpsError('unauthenticated', 'user must be authenticated.');
  }
  const snap = await getFirestore().collection('users').doc(uid).get();
  const tenantId = tenantIdOfUserData(snap.data());
  if (tenantId === '') {
    logger.error(`${nameOfCallingFunction}: user ${uid} is not linked to a tenant`);
    throw new functions.HttpsError('failed-precondition', 'User is not linked to a tenant.');
  }
  return tenantId;
}

export function checkStringField(request: functions.CallableRequest, nameOfCallingFunction: string, fieldName: string): string {
    const data = request.data[fieldName];
  if (!data || typeof data !== 'string') {
    logger.error(`${nameOfCallingFunction}: invalid ${fieldName} <${data}> provided`);
    throw new functions.HttpsError('invalid-argument', `${nameOfCallingFunction} must be called with a valid ${fieldName}.`);
  }
  return data;
}
