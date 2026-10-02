import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * The tenants the caller's person can actually log in to: every non-archived `users/{uid}` doc of
 * the same personKey whose Firebase Auth account exists and is not disabled. Shared by
 * `listMyLoginTenants` (tenant switcher) and `listMyDiaryTenants` (spec 1.77).
 * Returns `{ personKey: '', tenants: [] }` when the caller has no personKey; `tenants` is sorted.
 */
export async function loginTenantsOf(
  db: Firestore,
  uid: string,
): Promise<{ personKey: string; tenants: string[] }> {
  const ownSnap = await db.collection('users').doc(uid).get();
  const personKey = (ownSnap.data()?.['personKey'] as string) ?? '';
  if (!personKey) return { personKey: '', tenants: [] };

  const snap = await db
    .collection('users')
    .where('personKey', '==', personKey)
    .where('isArchived', '==', false)
    .get();

  const tenants = new Set<string>();
  await Promise.all(snap.docs.map(async doc => {
    // The caller's own account is signed in right now — no need to ask Auth about it.
    if (doc.id !== uid) {
      try {
        const authUser = await getAuth().getUser(doc.id);
        if (authUser.disabled) return;
      } catch {
        // No Firebase Auth account (or deleted) → that user doc cannot be logged into.
        return;
      }
    }
    ((doc.data()['tenants'] as string[]) ?? []).forEach(t => { if (t) tenants.add(t); });
  }));

  return { personKey, tenants: [...tenants].sort() };
}
