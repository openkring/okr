// apps/functions/src/pdf/resolve-admin.ts
import { getFirestore } from 'firebase-admin/firestore';

import { UserCollection } from '@okr/shared-models';

/**
 * Whether the caller counts as an admin for document generation — allowed to use raw-HTML
 * mode and rate-limited on the generous schedule.
 *
 * Pure so it can be unit-tested; `resolveIsAdmin` does the Firestore read around it.
 */
export function hasAdminRole(
  claims: Record<string, unknown> | undefined,
  roles: Record<string, unknown> | undefined
): boolean {
  return (
    claims?.['admin'] === true ||
    claims?.['contentAdmin'] === true ||
    roles?.['admin'] === true ||
    roles?.['contentAdmin'] === true
  );
}

/**
 * Resolves the caller's admin status from the auth token, falling back to `users/{uid}.roles`.
 *
 * The fallback is the load-bearing half: nothing in this project ever calls
 * `setCustomUserClaims`, so roles live **only** on the Firestore user doc (same as
 * `runPrivacyAudit`). Reading claims alone made `isAdmin` permanently false, and every
 * raw-HTML export — the Bearbeitungsverzeichnis and the privacy-audit report — died with
 * `permission-denied`, which the callable protocol surfaces to the browser as HTTP 403.
 * The claim check stays as a free fast path should claims ever be introduced.
 */
export async function resolveIsAdmin(
  uid: string,
  claims: Record<string, unknown> | undefined
): Promise<boolean> {
  if (hasAdminRole(claims, undefined)) return true;
  const snap = await getFirestore().collection(UserCollection).doc(uid).get();
  return hasAdminRole(claims, snap.data()?.['roles'] as Record<string, unknown> | undefined);
}
