import { getFirestore } from 'firebase-admin/firestore';

const USERS_COLLECTION = 'users';

/**
 * Find the treasurer person key + name to assign a review task to: the configured
 * `reviewAssigneePersonKey` (accounting-configs), else the first treasurer of the tenant, else the
 * first tenant admin. Shared by the OCR expense pipeline and the course compensation request
 * (spec 1.132 §7.6).
 */
export async function resolveTreasurer(tenantId: string, reviewAssigneePersonKey: string):
  Promise<{ key: string; name1: string; name2: string } | null> {
  const db = getFirestore();
  if (reviewAssigneePersonKey) {
    const snap = await db.collection(USERS_COLLECTION).where('personKey', '==', reviewAssigneePersonKey).limit(1).get();
    if (!snap.empty) {
      const u = snap.docs[0].data();
      return { key: reviewAssigneePersonKey, name1: u['firstName'] ?? '', name2: u['lastName'] ?? '' };
    }
  }
  const treasurerSnap = await db.collection(USERS_COLLECTION)
    .where('tenants', 'array-contains', tenantId)
    .where('roles.treasurer', '==', true)
    .limit(1).get();
  if (!treasurerSnap.empty) {
    const u = treasurerSnap.docs[0].data();
    return { key: u['personKey'] ?? '', name1: u['firstName'] ?? '', name2: u['lastName'] ?? '' };
  }
  // Fallback: no dedicated treasurer configured — assign to the first tenant admin.
  const adminSnap = await db.collection(USERS_COLLECTION)
    .where('tenants', 'array-contains', tenantId)
    .where('roles.admin', '==', true)
    .limit(1).get();
  if (adminSnap.empty) return null;
  const u = adminSnap.docs[0].data();
  return { key: u['personKey'] ?? '', name1: u['firstName'] ?? '', name2: u['lastName'] ?? '' };
}
