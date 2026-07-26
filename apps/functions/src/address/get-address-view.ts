// apps/functions/src/address/get-address-view.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { AddressModel, OrgCollection, PersonCollection, PrivacyAccessor, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getProjectedAddresses } from '@okr/shared-util-functions';

const REGION = 'europe-west6';
const MAX_KEYS = 50;

export interface GetAddressViewRequest {
  parentKeys: string[];   // 1..50 keys, each 'person.<okey>' or 'org.<okey>'
}

export interface GetAddressViewResponse {
  views: Record<string, AddressModel[]>;
}

/**
 * Tiered on-demand vault read (spec 1.19 Phase 4 §A4, decisions D9 + D-P4-1).
 * Applies the §A3 formula per call via the shared projection module:
 *  - owner (caller's users/{uid}.personKey matches the parentKey) → full own data
 *  - admin / privileged / memberAdmin → 'privileged' view (memberAdmin is an
 *    authorized ssn/dob editor per D9, so it hydrates edit forms through this
 *    audited chokepoint instead of raw Firestore reads)
 *  - any other authenticated member of a shared tenant → 'registered' view
 * Parents not sharing a tenant with the caller are silently omitted.
 */
export const getAddressView = onCall<GetAddressViewRequest, Promise<GetAddressViewResponse>>(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    checkAppCheckToken(request, 'getAddressView');
    checkAuthentication(request, 'getAddressView');

    const parentKeys = request.data?.parentKeys;
    if (!Array.isArray(parentKeys) || parentKeys.length === 0 || parentKeys.length > MAX_KEYS
      || parentKeys.some((k) => typeof k !== 'string' || !/^(person|org)\.\S+$/.test(k))) {
      throw new HttpsError('invalid-argument',
        `getAddressView requires 1..${MAX_KEYS} parentKeys of the form person.<okey> or org.<okey>.`);
    }

    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const userSnap = await db.collection(UserCollection).doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError('permission-denied', 'No user document for the caller.');
    }
    const roles = (userSnap.data()?.['roles'] ?? {}) as Record<string, boolean>;
    const callerTenants: string[] = userSnap.data()?.['tenants'] ?? [];
    const callerPersonKey: string = userSnap.data()?.['personKey'] ?? '';
    const elevated = roles['admin'] === true || roles['privileged'] === true || roles['memberAdmin'] === true;

    const views: Record<string, AddressModel[]> = {};
    for (const parentKey of parentKeys) {
      const isOwner = callerPersonKey !== '' && parentKey === `person.${callerPersonKey}`;

      // shared-tenant gate (mirrors the belongsToTenant rules helper)
      const [parentType, parentId] = parentKey.split(/\.(.*)/s);
      const parentSnap = await db
        .collection(parentType === 'person' ? PersonCollection : OrgCollection)
        .doc(parentId).get();
      if (!parentSnap.exists) continue;
      const parentTenants: string[] = parentSnap.data()?.['tenants'] ?? [];
      const sharesTenant = parentTenants.includes('system')
        || parentTenants.some((t) => callerTenants.includes(t));
      if (!isOwner && !sharesTenant) continue;

      const viewerAccessor: PrivacyAccessor = isOwner ? 'admin' : elevated ? 'privileged' : 'registered';
      views[parentKey] = await getProjectedAddresses(db, parentKey, viewerAccessor, callerTenants[0]);
    }

    // no PII in logs — counts and keys only
    logger.info(`getAddressView: uid=${uid} keys=${parentKeys.length} served=${Object.keys(views).length}`);
    return { views };
  },
);
