import type { Firestore } from 'firebase-admin/firestore';

import { AvatarInfo, PersonCollection, UserCollection } from '@okr/shared-models';
import { getFullName } from '@okr/shared-util-core';

/** The person's AvatarInfo from the raw `persons/{okey}` data; undefined when the person doc is missing. */
export function personAvatarInfo(personKey: string, data: Record<string, unknown> | undefined): AvatarInfo | undefined {
  if (!personKey || !data) return undefined;
  const name1 = typeof data['firstName'] === 'string' ? data['firstName'] : '';
  const name2 = typeof data['lastName'] === 'string' ? data['lastName'] : '';
  return { key: personKey, name1, name2, modelType: 'person', type: '', subType: '', label: getFullName(name1, name2) };
}

/** The distinct, non-empty `personKey`s of user docs; users without one are skipped. */
export function distinctPersonKeys(users: Record<string, unknown>[]): string[] {
  const keys = users.map((u) => (typeof u['personKey'] === 'string' ? u['personKey'] : '')).filter((k) => k !== '');
  return [...new Set(keys)];
}

/**
 * The persons holding the memberAdmin role of tenant `tenantId`: `users` with the tenant in `tenants`
 * and `roles.memberAdmin == true`, mapped to their person's AvatarInfo. Users without `personKey`
 * (or whose person doc is gone) are skipped.
 */
export async function getMemberAdminPersons(db: Firestore, tenantId: string): Promise<AvatarInfo[]> {
  const snap = await db.collection(UserCollection)
    .where('tenants', 'array-contains', tenantId)
    .where('roles.memberAdmin', '==', true)
    .get();
  const keys = distinctPersonKeys(snap.docs.map((d) => d.data()));
  const persons = await Promise.all(keys.map(async (key) => personAvatarInfo(key, (await db.collection(PersonCollection).doc(key).get()).data())));
  return persons.filter((p): p is AvatarInfo => p !== undefined);
}
