// apps/functions/src/person/migrate-sensitive-data.ts
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Query, DocumentData } from 'firebase-admin/firestore';

import { AddressCollection, MembershipCollection, PersonCollection, ScsMemberFeesCollection } from '@okr/shared-models';
import { getBirthYear } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkAdminRole } from '@okr/shared-util-functions';

const REGION = 'europe-west6';
const BATCH = 400;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FsData = Record<string, any>;

/** Iterate a collection in id-ordered pages; runs `fn` per doc. Returns docs seen. */
async function forEachDoc(base: Query<DocumentData>, fn: (id: string, data: FsData) => Promise<void>): Promise<number> {
  let last: string | undefined;
  let seen = 0;
  for (;;) {
    let q = base.orderBy('__name__').limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      await fn(doc.id, doc.data());
      seen++;
    }
    last = snap.docs[snap.docs.length - 1].id;
    if (snap.size < BATCH) break;
  }
  return seen;
}

/**
 * Upsert a sensitive scalar-channel address (ssn/dob) for a parent. Idempotent:
 * skips when an up-to-date vault doc already exists.
 */
async function upsertScalar(
  db: FirebaseFirestore.Firestore,
  parentKey: string,
  channel: 'ssn' | 'dob',
  value: string,
  tenants: string[],
): Promise<boolean> {
  if (!value) return false;
  const existing = await db.collection(AddressCollection)
    .where('parentKey', '==', parentKey)
    .where('addressChannel', '==', channel)
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    if (doc.data()[channel] === value) return false;
    await doc.ref.update({ [channel]: value });
    return true;
  }
  await db.collection(AddressCollection).add({
    addressChannel: channel,
    [channel]: value,
    parentKey,
    isFavorite: false,
    isArchived: false,
    tenants: Array.isArray(tenants) && tenants.length ? tenants : ['system'],
    index: '',
  });
  return true;
}

/**
 * One-time, idempotent backfill for spec 1.19 Phase 3. Admin-only.
 * Copies persons.ssnId/dateOfBirth into the addresses vault (ssn/dob channels) and
 * backfills memberBirthYear on memberships + scs-memberfees. Safe to re-run: every
 * write is skipped when the target already matches. Does NOT strip source fields
 * (that is Phase 4).
 */
export const migrateSensitiveData = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request): Promise<FsData> => {
    checkAppCheckToken(request, 'migrateSensitiveData');
    checkAuthentication(request, 'migrateSensitiveData');
    await checkAdminRole(request, 'migrateSensitiveData');

    const db = getFirestore();
    const result = { persons: 0, ssnAddresses: 0, dobAddresses: 0, memberships: 0, memberfees: 0 };

    // 1. persons → ssn/dob vault addresses
    result.persons = await forEachDoc(db.collection(PersonCollection), async (id, p) => {
      const parentKey = `person.${id}`;
      const tenants = Array.isArray(p.tenants) ? p.tenants : [];
      if (await upsertScalar(db, parentKey, 'ssn', p.ssnId ?? '', tenants)) result.ssnAddresses++;
      if (await upsertScalar(db, parentKey, 'dob', p.dateOfBirth ?? '', tenants)) result.dobAddresses++;
    });

    // 2. memberships → memberBirthYear
    result.memberships = await forEachDoc(db.collection(MembershipCollection), async (id, m) => {
      const year = getBirthYear(m.memberDateOfBirth);
      if (year && m.memberBirthYear !== year) {
        await db.collection(MembershipCollection).doc(id).update({ memberBirthYear: year });
      }
    });

    // 3. scs-memberfees → memberBirthYear
    result.memberfees = await forEachDoc(db.collection(ScsMemberFeesCollection), async (id, f) => {
      const year = getBirthYear(f.memberDateOfBirth);
      if (year && f.memberBirthYear !== year) {
        await db.collection(ScsMemberFeesCollection).doc(id).update({ memberBirthYear: year });
      }
    });

    logger.info('migrateSensitiveData: done', result);
    return result;
  },
);
