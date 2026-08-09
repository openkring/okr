import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

const REGION = 'europe-west6';
const CF_NAME = 'listTenantStorageFiles';

export interface TenantStorageFile {
  fullPath: string;
  size: number;
  contentType: string;
  timeCreated: string;   // ISO 8601
  updated: string;       // ISO 8601
  md5Hash: string;       // base64
}

/** The subset of a GCS `File` this function reads — keeps the pure half testable. */
export interface StorageObject {
  name: string;
  metadata: { size?: string | number; contentType?: string; timeCreated?: string; updated?: string; md5Hash?: string };
}

/**
 * Pure half: drop what must not be reported, map the rest to the wire shape.
 *
 * `private/` holds the D-P5-1 subject-access export ZIPs (AHV number, dob, IBAN in
 * plaintext). They are CF-written and delivered only through a short-lived signed URL —
 * never list them back to a client, admin or not.
 *
 * A "folder placeholder" is a zero-byte object whose name ends in '/'. It is not a file and
 * has no Firestore document by design, so it would show up as a false orphan in AOC.
 */
export function toTenantStorageFiles(objects: StorageObject[], tenantId: string): TenantStorageFile[] {
  const prefix = `tenant/${tenantId}/`;
  return objects
    .filter(o => o.name.startsWith(prefix) && !o.name.startsWith(`${prefix}private/`) && !o.name.endsWith('/'))
    .map(o => ({
      fullPath: o.name,
      size: Number(o.metadata.size ?? 0),
      contentType: o.metadata.contentType ?? '',
      timeCreated: o.metadata.timeCreated ?? '',
      updated: o.metadata.updated ?? '',
      md5Hash: o.metadata.md5Hash ?? '',
    }));
}

/**
 * Lists every object under `tenant/{tenantId}/` for an admin of that tenant.
 *
 * Why this is a Cloud Function and not a client-side `listAll()`:
 * a Storage `list` request cannot be authorised by `storage.rules`, because every rule in
 * that file derives authorisation from the caller's `users/{uid}` doc via the cross-service
 * `firestore.get()`/`firestore.exists()` functions — and those do not resolve on a `list`
 * request, so `inTenant()` denies with a 403 no matter how the match block is shaped.
 * (Verified 2026-08-09: `get`/`create`/`delete` under the exact same rule and the exact
 * same caller succeed — uploads, reads and downloads all work — while `list` on the tenant
 * prefix 403s. The Rules test API allows that same `list` when the Firestore reads are
 * mocked, which isolates the cross-service call as the difference.) The alternative would
 * be to grant `list` on the tenant prefix to any `signedIn()` caller, which would let every
 * signed-in user of any tenant enumerate every other tenant's file names. The Admin SDK
 * bypasses rules entirely, so authorisation is enforced here instead: admin role AND
 * membership of the requested tenant, both read from the caller's own `users/{uid}` doc.
 */
export const listTenantStorageFiles = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest): Promise<{ files: TenantStorageFile[] }> => {
    checkAppCheckToken(request, CF_NAME);
    checkAuthentication(request, CF_NAME);

    const tenantId = request.data?.tenantId;
    if (typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new HttpsError('invalid-argument', `${CF_NAME} requires a tenantId.`);
    }

    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', `${CF_NAME} requires an authenticated caller.`);
    }

    // Admin OF THIS tenant — not admin of some other tenant. Same shape as
    // `applyFeatureSelection`; deliberately not `checkAdminRole`, which has no notion of
    // which tenant the caller administers.
    const userSnap = await getFirestore().collection(UserCollection).doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError('permission-denied', 'No user document for the caller.');
    }
    const roles = (userSnap.data()?.['roles'] ?? {}) as Record<string, boolean>;
    if (roles['admin'] !== true) {
      throw new HttpsError('permission-denied', 'Nur Administratoren können den Speicher auflisten.');
    }
    const callerTenants: string[] = userSnap.data()?.['tenants'] ?? [];
    if (!callerTenants.includes(tenantId)) {
      throw new HttpsError('permission-denied', 'Caller does not belong to this tenant.');
    }

    // `private/` holds the D-P5-1 subject-access export ZIPs (AHV number, dob, IBAN in
    // plaintext). They are CF-written and delivered only through a short-lived signed URL —
    // never list them back to a client, admin or not.
    const [objects] = await getStorage().bucket().getFiles({ prefix: `tenant/${tenantId}/` });
    const files = toTenantStorageFiles(objects, tenantId);

    logger.info(`${CF_NAME}: tenant=${tenantId} files=${files.length}`);
    return { files };
  },
);
