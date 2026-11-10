import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { countUsers } from './measure.logic';
import type { UserForCount } from './measure.logic';

const AUTH_BATCH = 100; // getUsers() accepts at most 100 identifiers

/** Zurich wall-clock calendar day of an Auth creation time, as StoreDate. */
function zurichStoreDate(creationTime: string): string {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(creationTime));
  return convertDateFormatToString(iso, DateFormat.IsoDate, DateFormat.StoreDate);
}

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
  for (let i = 0; i < docs.length; i += AUTH_BATCH) {
    const batch = docs.slice(i, i + AUTH_BATCH);
    const res = await getAuth().getUsers(batch.map((d) => ({ uid: d.id })));
    const byUid = new Map(res.users.map((r) => [r.uid, r]));
    for (const d of batch) {
      const rec = byUid.get(d.id);
      if (!rec) continue;
      users.push({
        roles: (d.data()['roles'] ?? {}) as Record<string, boolean>,
        isArchived: false,
        disabled: rec.disabled,
        createdAt: rec.metadata.creationTime ? zurichStoreDate(rec.metadata.creationTime) : undefined,
      });
    }
  }
  return countUsers(users, lastDay);
}
