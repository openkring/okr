import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

import { logger } from 'firebase-functions/v2';

import { platformBilling } from '../collection/platform';
import { toStoreDate } from '../srv/zurich-time';
import { countUsers } from './measure.logic';
import type { UserForCount } from './measure.logic';

const AUTH_BATCH = 100; // getUsers() accepts at most 100 identifiers

/**
 * Counts a tenant's billable users (pricing §9.1). `users/{uid}` supplies tenant, roles and
 * `isArchived`; "disabled" and the creation date exist only in Firebase Auth (`disabled`,
 * `metadata.creationTime`), so Auth is read in batches of 100. A user with no Auth record is not
 * a working account and does not count.
 */
export async function measureTenant(db: Firestore, tenantId: string, lastDay: string): Promise<ReturnType<typeof countUsers>> {
  const snap = await db.collection('users').where('tenants', 'array-contains', tenantId).get();
  const docs = snap.docs.filter((d) => d.data()['isArchived'] !== true);
  const users: UserForCount[] = [];
  let unmatched = 0;
  for (let i = 0; i < docs.length; i += AUTH_BATCH) {
    const batch = docs.slice(i, i + AUTH_BATCH);
    const res = await getAuth().getUsers(batch.map((d) => ({ uid: d.id })));
    const byUid = new Map(res.users.map((r) => [r.uid, r]));
    for (const d of batch) {
      const rec = byUid.get(d.id);
      if (!rec) {
        unmatched++;
        continue;
      }
      users.push({
        uid: d.id,
        roles: (d.data()['roles'] ?? {}) as Record<string, boolean>,
        isArchived: false,
        disabled: rec.disabled,
        createdAt: rec.metadata.creationTime ? toStoreDate(new Date(rec.metadata.creationTime)) : undefined,
      });
    }
  }
  if (unmatched > 0) {
    logger.warn(`measureTenant: ${unmatched} users/{uid} docs of tenant ${tenantId} have no Auth record and are not counted.`);
  }
  const { excludedUids } = await platformBilling(db);
  return countUsers(users, lastDay, excludedUids);
}
