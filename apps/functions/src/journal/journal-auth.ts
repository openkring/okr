import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';

import { JournalCollection, UserCollection } from '@okr/shared-models';
import { tenantIdOfUserData } from '@okr/shared-util-functions';

import { isJournalKey } from './apply-journal-change.logic';

export interface JournalCaller { tenantId: string; personKey: string; journalKey: string }

/**
 * The caller must be an author of the journal (spec 1.113 §3): their person key in the journal's
 * `authorKeys`, the journal in their tenant and not archived. A journal the function has not written
 * yet (its first records are still on their way) answers `failed-precondition` — the device retries.
 */
export async function requireJournalAuthor(db: Firestore, uid: string, journalKey: unknown): Promise<JournalCaller> {
  if (!isJournalKey(journalKey)) throw new HttpsError('invalid-argument', 'Invalid journalKey.');
  const user = (await db.collection(UserCollection).doc(uid).get()).data();
  const tenantId = tenantIdOfUserData(user);
  const personKey = typeof user?.['personKey'] === 'string' ? user['personKey'] : '';
  if (tenantId === '' || personKey === '') throw new HttpsError('permission-denied', 'No linked person.');
  const journal = (await db.collection(JournalCollection).doc(journalKey).get()).data();
  if (!journal) throw new HttpsError('failed-precondition', 'Journal not synchronised yet.');
  const tenants: unknown = journal['tenants'];
  const authorKeys: unknown = journal['authorKeys'];
  if (journal['isArchived'] === true || !Array.isArray(tenants) || !tenants.includes(tenantId)
    || !Array.isArray(authorKeys) || !authorKeys.includes(personKey)) {
    throw new HttpsError('permission-denied', 'Not an author of this journal.');
  }
  return { tenantId, personKey, journalKey };
}
