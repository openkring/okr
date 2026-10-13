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

/**
 * The operator tenant: the one app (used only by the operator) that may run tools reaching
 * across tenants — tenant allocation, the project-wide login list (spec 1.101 §6). All tenants
 * share one Firebase project, so these tools are gated HERE, on the server; hiding their screens
 * in the other apps is not access control.
 */
export const OPERATOR_TENANT_ID = 'bka';

/**
 * True only when the `users` doc belongs to the operator tenant alone AND carries `roles.admin`
 * in that same doc: `tenants` is an array of exactly one entry, equal to OPERATOR_TENANT_ID, and
 * `roles` is an object whose `admin` is exactly `true`. The custom claim is never consulted here.
 *
 * Do NOT reduce this to `tenants[0]`: the Firestore rules let an admin of one tenant write a users
 * doc of their own tenant with `['bka', <own tenant>]` (they only check hasAny), so the first entry
 * is attacker-controlled and would make that admin the operator. Requiring exactly ['bka'] makes that
 * write grant nothing.
 *
 * `roles.admin` closes the self-create path: a user without a users doc may create their own doc
 * with any `tenants`, but the rules bar them from setting admin/privileged roles, so a self-created
 * doc can never carry `roles.admin: true`. And a non-bka admin cannot write a doc of exactly ['bka'].
 */
export function isOperatorUserData(userData: Record<string, unknown> | undefined): boolean {
  const tenants = userData?.['tenants'];
  const roles = userData?.['roles'];
  const isAdminRole = typeof roles === 'object' && roles !== null && !Array.isArray(roles) && (roles as Record<string, unknown>)['admin'] === true;
  return Array.isArray(tenants) && tenants.length === 1 && tenants[0] === OPERATOR_TENANT_ID && isAdminRole;
}

/** The caller as derived server-side from `users/{uid}` in one read. */
export interface CallerContext {
  tenantId: string;
  isOperator: boolean;
}

/**
 * Who is calling, read server-side from `users/{uid}` (one Firestore read). `tenantId` follows
 * getCallerTenantId; `isOperator` follows isOperatorUserData. Use this instead of combining
 * getCallerTenantId with a tenant comparison.
 */
export async function getCallerContext(request: functions.CallableRequest, nameOfCallingFunction: string): Promise<CallerContext> {
  const uid = request.auth?.uid;
  if (!uid) {
    logger.error(`${nameOfCallingFunction}: user is not authenticated`);
    throw new functions.HttpsError('unauthenticated', 'user must be authenticated.');
  }
  const snap = await getFirestore().collection('users').doc(uid).get();
  const userData = snap.data();
  const tenantId = tenantIdOfUserData(userData);
  if (tenantId === '') {
    logger.error(`${nameOfCallingFunction}: user ${uid} is not linked to a tenant`);
    throw new functions.HttpsError('failed-precondition', 'User is not linked to a tenant.');
  }
  return { tenantId, isOperator: isOperatorUserData(userData) };
}

/**
 * May the caller delete the Firebase Auth login `targetUserData` belongs to?
 * The operator may delete any login (including one with no `users` doc at all). Any other tenant
 * only the login of a user that belongs to it alone — never another tenant's, never a shared one,
 * never one whose `users` doc is gone (that is an orphan, which only the operator handles).
 */
export function mayDeleteAuthUser(caller: CallerContext, targetUserData: Record<string, unknown> | undefined): boolean {
  if (caller.isOperator) return true;
  if (!caller.tenantId) return false;
  const tenants = targetUserData?.['tenants'];
  return Array.isArray(tenants) && tenants.length === 1 && tenants[0] === caller.tenantId;
}

/** Split `items` into consecutive slices of at most `size` (e.g. `getAuth().getUsers()` takes ≤ 100). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`chunk: size must be a positive integer, got ${size}`);
  const slices: T[][] = [];
  for (let i = 0; i < items.length; i += size) slices.push(items.slice(i, i + size));
  return slices;
}

/**
 * Authorize an operator-only callable. Call AFTER `checkAdminRole`. Denies unless the caller's
 * users doc is the operator's alone (see isOperatorUserData). Returns OPERATOR_TENANT_ID.
 */
export async function checkOperatorTenant(request: functions.CallableRequest, nameOfCallingFunction: string): Promise<string> {
  const caller = await getCallerContext(request, nameOfCallingFunction);
  if (!caller.isOperator) {
    logger.error(`${nameOfCallingFunction}: tenant ${caller.tenantId} is not the operator tenant`);
    throw new functions.HttpsError('permission-denied', 'Diese Funktion gibt es nur in der Betreiber-App.');
  }
  return OPERATOR_TENANT_ID;
}

export function checkStringField(request: functions.CallableRequest, nameOfCallingFunction: string, fieldName: string): string {
    const data = request.data[fieldName];
  if (!data || typeof data !== 'string') {
    logger.error(`${nameOfCallingFunction}: invalid ${fieldName} <${data}> provided`);
    throw new functions.HttpsError('invalid-argument', `${nameOfCallingFunction} must be called with a valid ${fieldName}.`);
  }
  return data;
}
