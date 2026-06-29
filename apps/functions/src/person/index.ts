// apps/functions/src/person/index.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { PersonCollection, UserCollection } from '@bk2/shared-models';
import { addIndexElement } from '@bk2/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@bk2/shared-util-functions';
import type {
  FindPersonDuplicatesRequest,
  FindPersonDuplicatesResponse,
  MergePersonIntoTenantRequest,
  MergePersonIntoTenantResponse,
  PersonDuplicateCandidate,
} from '@bk2/subject-person-util';

const REGION = 'europe-west6';
const ALLOWED_ROLES = ['admin', 'memberAdmin'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FsData = Record<string, any>;

/** Throw unless the caller has admin or memberAdmin in their users/{uid}.roles. */
async function requireMemberAdmin(uid: string | undefined, fnName: string): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'Not authenticated.');
  const snap = await getFirestore().collection(UserCollection).doc(uid).get();
  const roles = (snap.data()?.roles ?? {}) as Record<string, boolean>;
  if (!ALLOWED_ROLES.some((r) => roles[r] === true)) {
    logger.error(`${fnName}: uid ${uid} lacks required role(s): ${ALLOWED_ROLES.join(', ')}`);
    throw new HttpsError('permission-denied', `Requires one of roles: ${ALLOWED_ROLES.join(', ')}.`);
  }
}

/** Mirror of getPersonIndex (subject-person-util) — keep field order in sync. */
function buildPersonIndex(p: FsData): string {
  let index = '';
  index = addIndexElement(index, 'n', p.lastName ?? '');
  index = addIndexElement(index, 'z', p.favZipCode ?? '');
  index = addIndexElement(index, 'fn', p.firstName ?? '');
  index = addIndexElement(index, 'bx', p.bexioId ?? '');
  index = addIndexElement(index, 'dob', p.dateOfBirth ?? '');
  return index;
}

function toCandidate(id: string, d: FsData): PersonDuplicateCandidate {
  return {
    bkey: id,
    firstName: d.firstName ?? '',
    lastName: d.lastName ?? '',
    gender: d.gender ?? '',
    dateOfBirth: d.dateOfBirth ?? '',
    dateOfDeath: d.dateOfDeath ?? '',
    ssnId: d.ssnId ?? '',
    favEmail: d.favEmail ?? '',
    favPhone: d.favPhone ?? '',
    favZipCode: d.favZipCode ?? '',
    bexioId: d.bexioId ?? '',
    tenants: Array.isArray(d.tenants) ? d.tenants : [],
  };
}

/**
 * Cross-tenant duplicate search. A person matches if ANY identifier matches:
 * lastName+firstName (case-insensitive), dateOfBirth, favEmail, or ssnId.
 * Queries are single-field equalities (automatic indexes); isArchived and the firstName
 * case-insensitive comparison are applied in memory (no composite indexes needed).
 */
export const findPersonDuplicates = onCall(
  { region: REGION },
  async (request): Promise<FindPersonDuplicatesResponse> => {
    checkAppCheckToken(request, 'findPersonDuplicates');
    checkAuthentication(request, 'findPersonDuplicates');
    await requireMemberAdmin(request.auth?.uid, 'findPersonDuplicates');

    const { firstName, lastName, dateOfBirth, favEmail, ssnId } =
      (request.data ?? {}) as FindPersonDuplicatesRequest;
    const db = getFirestore();
    const found = new Map<string, FsData>();

    const equalityFields: Array<[string, string | undefined]> = [
      ['ssnId', ssnId],
      ['favEmail', favEmail],
      ['dateOfBirth', dateOfBirth],
    ];
    for (const [field, value] of equalityFields) {
      if (!value) continue;
      const snap = await db.collection(PersonCollection).where(field, '==', value).get();
      snap.forEach((doc) => found.set(doc.id, doc.data()));
    }

    if (lastName && firstName) {
      const snap = await db.collection(PersonCollection).where('lastName', '==', lastName).get();
      const wantFirst = (firstName ?? '').trim().toLowerCase();
      snap.forEach((doc) => {
        const data = doc.data();
        if ((data.firstName ?? '').trim().toLowerCase() === wantFirst) found.set(doc.id, data);
      });
    }

    const candidates: PersonDuplicateCandidate[] = [];
    found.forEach((data, id) => {
      if (data.isArchived !== true) candidates.push(toCandidate(id, data));
    });
    return { candidates };
  },
);

/**
 * Shares an existing person into the caller's tenant (arrayUnion, idempotent) and applies the
 * resolved scalar fields chosen during reconciliation, recomputing the search index.
 */
export const mergePersonIntoTenant = onCall(
  { region: REGION },
  async (request): Promise<MergePersonIntoTenantResponse> => {
    checkAppCheckToken(request, 'mergePersonIntoTenant');
    checkAuthentication(request, 'mergePersonIntoTenant');
    await requireMemberAdmin(request.auth?.uid, 'mergePersonIntoTenant');

    const { personKey, tenantId, resolvedFields } =
      (request.data ?? {}) as MergePersonIntoTenantRequest;
    if (!personKey || !tenantId) {
      throw new HttpsError('invalid-argument', 'personKey and tenantId are required.');
    }

    const db = getFirestore();
    const ref = db.collection(PersonCollection).doc(personKey);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', `Person ${personKey} not found.`);

    const merged: FsData = { ...snap.data(), ...(resolvedFields ?? {}) };
    await ref.update({
      ...(resolvedFields ?? {}),
      tenants: FieldValue.arrayUnion(tenantId),
      index: buildPersonIndex(merged),
    });
    return { bkey: personKey };
  },
);
