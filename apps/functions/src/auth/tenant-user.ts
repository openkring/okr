// apps/functions/src/auth/tenant-user.ts
//
// Helpers for the admin callables that act on ONE users doc (setLoginId, swapLoginEmail, setPassword,
// updateFirebaseUser).
//
// loadTenantUser is their tenant guard: checkAdminRole only says the caller is an admin somewhere;
// this says the target account belongs to the caller's tenant — without it an admin of one tenant
// could take over an account of another.

import { getAuth } from 'firebase-admin/auth';
import { DocumentSnapshot, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';

import { UserModel } from '@okr/shared-models';
import { getUserIndex } from '@okr/user-util';

/** users/{uid}, when it exists AND serves `tenantId`; else not-found (the same answer for both — no oracle). */
export async function loadTenantUser(uid: string, tenantId: string) {
  const snap = await getFirestore().collection('users').doc(uid).get();
  if (!snap.exists || !((snap.data()?.['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw new HttpsError('not-found', 'Dieses Benutzerkonto gibt es nicht.');
  }
  return snap;
}

export type LoginPatch = { loginEmail?: string; loginId?: string };

/** The patch plus the users-doc search index rebuilt from it — the index carries loginEmail and loginId. */
export function withIndex(snap: DocumentSnapshot, patch: LoginPatch): LoginPatch & { index: string } {
  return { ...patch, index: getUserIndex({ ...(snap.data() as UserModel), okey: snap.id, ...patch }) };
}

/** Best-effort restore of an Auth email; a failure is logged (uid only) and never hides the caller's error. */
export async function restoreAuthEmail(uid: string, email: string, cfName: string): Promise<void> {
  try {
    await getAuth().updateUser(uid, { email });
  } catch (error) {
    logger.error(`${cfName}: could not restore the Auth email of users/${uid}`, { message: error instanceof Error ? error.message : 'unknown' });
  }
}
