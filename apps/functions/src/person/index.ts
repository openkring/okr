// apps/functions/src/person/index.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { AddressCollection, PersonCollection, UserCollection } from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import type {
  FindPersonDuplicatesRequest,
  FindPersonDuplicatesResponse,
  MergePersonIntoTenantRequest,
  MergePersonIntoTenantResponse,
  PersonDuplicateCandidate,
} from '@okr/subject-person-util';

const REGION = 'europe-west6';
const ALLOWED_ROLES = ['admin', 'memberAdmin'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FsData = Record<string, any>;

/** Throw unless the caller has admin or memberAdmin in their users/{uid}.roles.
 *  Returns the caller's tenants array (from users/{uid}.tenants). */
async function requireMemberAdmin(uid: string | undefined, fnName: string): Promise<string[]> {
  if (!uid) throw new HttpsError('unauthenticated', 'Not authenticated.');
  const snap = await getFirestore().collection(UserCollection).doc(uid).get();
  const data = snap.data() ?? {};
  const roles = (data.roles ?? {}) as Record<string, boolean>;
  if (!ALLOWED_ROLES.some((r) => roles[r] === true)) {
    logger.error(`${fnName}: uid ${uid} lacks required role(s): ${ALLOWED_ROLES.join(', ')}`);
    throw new HttpsError('permission-denied', `Requires one of roles: ${ALLOWED_ROLES.join(', ')}.`);
  }
  return Array.isArray(data.tenants) ? data.tenants : [];
}

/**
 * Upsert a sensitive scalar-channel address (ssn/dob) for a person (spec 1.19 Phase 3).
 * Idempotent; skips when the vault value already matches. Admin SDK, bypasses rules.
 */
async function upsertVaultScalar(
  db: FirebaseFirestore.Firestore,
  personId: string,
  channel: 'ssn' | 'dob' | 'dod',
  value: string,
  tenants: string[],
): Promise<void> {
  if (!value) return;
  const parentKey = `person.${personId}`;
  const existing = await db.collection(AddressCollection)
    .where('parentKey', '==', parentKey).where('addressChannel', '==', channel).limit(1).get();
  if (!existing.empty) {
    if (existing.docs[0].data()[channel] !== value) await existing.docs[0].ref.update({ [channel]: value });
    return;
  }
  await db.collection(AddressCollection).add({
    addressChannel: channel, [channel]: value, parentKey, isFavorite: false, isArchived: false,
    tenants: Array.isArray(tenants) && tenants.length ? tenants : ['system'], index: '',
  });
}

/**
 * Upsert the favorite contact address (email/phone) of a person — the reconcile
 * flow resolves these onto address docs since person.favEmail/favPhone were
 * stripped (spec 1.19 Phase 4). Idempotent.
 */
async function upsertFavoriteContact(
  db: FirebaseFirestore.Firestore,
  personId: string,
  channel: 'email' | 'phone',
  value: string,
  tenants: string[],
): Promise<void> {
  if (!value) return;
  const parentKey = `person.${personId}`;
  const existing = await db.collection(AddressCollection)
    .where('parentKey', '==', parentKey).where('addressChannel', '==', channel)
    .where('isFavorite', '==', true).limit(1).get();
  if (!existing.empty) {
    if (existing.docs[0].data()[channel] !== value) await existing.docs[0].ref.update({ [channel]: value });
    return;
  }
  await db.collection(AddressCollection).add({
    addressChannel: channel, [channel]: value, parentKey, isFavorite: true, isArchived: false,
    tenants: Array.isArray(tenants) && tenants.length ? tenants : ['system'], index: '',
  });
}

/**
 * Loads the candidate's vault/contact values from its addresses (spec 1.19 Phase 4:
 * ssn/dob/dod/favEmail/favPhone no longer live on the person doc).
 */
async function loadCandidateAddressData(
  db: FirebaseFirestore.Firestore,
  personId: string,
): Promise<{ ssnId: string; dateOfBirth: string; dateOfDeath: string; favEmail: string; favPhone: string }> {
  const snap = await db.collection(AddressCollection)
    .where('parentKey', '==', `person.${personId}`).get();
  const result = { ssnId: '', dateOfBirth: '', dateOfDeath: '', favEmail: '', favPhone: '' };
  snap.forEach((doc) => {
    const a = doc.data();
    if (a.addressChannel === 'ssn') result.ssnId = String(a.ssn ?? '');
    if (a.addressChannel === 'dob') result.dateOfBirth = String(a.dob ?? '');
    if (a.addressChannel === 'dod') result.dateOfDeath = String(a.dod ?? '');
    if (a.addressChannel === 'email' && a.isFavorite === true) result.favEmail = String(a.email ?? '');
    if (a.addressChannel === 'phone' && a.isFavorite === true) result.favPhone = String(a.phone ?? '');
  });
  return result;
}

/** Mirror of getPersonIndex (subject-person-util) — keep field order in sync. */
function buildPersonIndex(p: FsData): string {
  let index = '';
  index = addIndexElement(index, 'n', p.lastName ?? '');
  index = addIndexElement(index, 'z', p.favZipCode ?? '');
  index = addIndexElement(index, 'fn', p.firstName ?? '');
  index = addIndexElement(index, 'bx', p.bexioId ?? '');
  // dob dropped from the search index (spec 1.19 Phase 3) — keep in sync with getPersonIndex.
  return index;
}

function toCandidate(
  id: string,
  d: FsData,
  addressData: { ssnId: string; dateOfBirth: string; dateOfDeath: string; favEmail: string; favPhone: string },
): PersonDuplicateCandidate {
  // ssn/dob/dod/favEmail/favPhone come from the addresses vault/favorites
  // (spec 1.19 Phase 4) — the person doc no longer carries them.
  return {
    okey: id,
    firstName: d.firstName ?? '',
    lastName: d.lastName ?? '',
    gender: d.gender ?? '',
    dateOfBirth: addressData.dateOfBirth,
    dateOfDeath: addressData.dateOfDeath,
    ssnId: addressData.ssnId,
    favEmail: addressData.favEmail,
    favPhone: addressData.favPhone,
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

    // ssn/dob/email live only in the addresses vault/favorites (spec 1.19 Phase 4):
    // match there and resolve back to the owning persons via parentKey.
    const vaultMatches: Array<['ssn' | 'dob' | 'email', string | undefined]> = [
      ['ssn', ssnId],
      ['dob', dateOfBirth],
      ['email', favEmail],
    ];
    for (const [channel, value] of vaultMatches) {
      if (!value) continue;
      const addrSnap = await db.collection(AddressCollection)
        .where('addressChannel', '==', channel).where(channel, '==', value).limit(50).get();
      for (const addr of addrSnap.docs) {
        const parentKey = String(addr.data().parentKey ?? '');
        if (!parentKey.startsWith('person.')) continue;
        const personId = parentKey.slice('person.'.length);
        if (found.has(personId)) continue;
        const personDoc = await db.collection(PersonCollection).doc(personId).get();
        if (personDoc.exists) found.set(personId, personDoc.data() as FsData);
      }
    }

    if (lastName && firstName) {
      const snap = await db.collection(PersonCollection).where('lastName', '==', lastName).limit(50).get();
      const wantFirst = (firstName ?? '').trim().toLowerCase();
      snap.forEach((doc) => {
        const data = doc.data();
        if ((data.firstName ?? '').trim().toLowerCase() === wantFirst) found.set(doc.id, data);
      });
    }

    const candidates: PersonDuplicateCandidate[] = [];
    for (const [id, data] of found) {
      if (data.isArchived === true) continue;
      candidates.push(toCandidate(id, data, await loadCandidateAddressData(db, id)));
    }
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
    const callerTenants = await requireMemberAdmin(request.auth?.uid, 'mergePersonIntoTenant');

    const { personKey, tenantId, resolvedFields } =
      (request.data ?? {}) as MergePersonIntoTenantRequest;
    if (!personKey || !tenantId) {
      throw new HttpsError('invalid-argument', 'personKey and tenantId are required.');
    }
    if (!callerTenants.includes(tenantId)) {
      throw new HttpsError('permission-denied', 'Caller does not belong to the target tenant.');
    }

    // Person-writable fields only — ssnId/dateOfBirth/dateOfDeath go to the vault and
    // favEmail/favPhone to the favorite addresses (spec 1.19 Phase 4 strip;
    // writing them onto the person would resurrect the stripped fields).
    const PERSON_FIELDS = ['firstName', 'lastName', 'gender', 'favZipCode'];
    const ADDRESS_FIELDS = ['ssnId', 'dateOfBirth', 'dateOfDeath', 'favEmail', 'favPhone'];
    const safeFields: FsData = {};
    const addressFields: FsData = {};
    for (const key of PERSON_FIELDS) {
      if (resolvedFields && key in resolvedFields) {
        safeFields[key] = String(resolvedFields[key]);
      }
    }
    for (const key of ADDRESS_FIELDS) {
      if (resolvedFields && key in resolvedFields) {
        addressFields[key] = String(resolvedFields[key]);
      }
    }

    const db = getFirestore();
    const ref = db.collection(PersonCollection).doc(personKey);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', `Person ${personKey} not found.`);

    const merged: FsData = { ...snap.data(), ...safeFields };
    await ref.update({
      ...safeFields,
      tenants: FieldValue.arrayUnion(tenantId),
      index: buildPersonIndex(merged),
    });

    // Write the resolved sensitive/contact fields into the vault and favorites
    // (spec 1.19 Phase 4: they no longer exist on the person doc).
    const mergedTenants: string[] = Array.isArray(merged.tenants)
      ? Array.from(new Set([...merged.tenants, tenantId])) : [tenantId];
    if ('ssnId' in addressFields) await upsertVaultScalar(db, personKey, 'ssn', addressFields.ssnId, mergedTenants);
    if ('dateOfBirth' in addressFields) await upsertVaultScalar(db, personKey, 'dob', addressFields.dateOfBirth, mergedTenants);
    if ('dateOfDeath' in addressFields) await upsertVaultScalar(db, personKey, 'dod', addressFields.dateOfDeath, mergedTenants);
    if ('favEmail' in addressFields) await upsertFavoriteContact(db, personKey, 'email', addressFields.favEmail, mergedTenants);
    if ('favPhone' in addressFields) await upsertFavoriteContact(db, personKey, 'phone', addressFields.favPhone, mergedTenants);
    return { okey: personKey };
  },
);
