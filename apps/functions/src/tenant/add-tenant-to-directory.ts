// apps/functions/src/tenant/add-tenant-to-directory.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Query, DocumentData } from 'firebase-admin/firestore';

import { AddressCollection, PersonCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkAdminRole } from '@okr/shared-util-functions';

const REGION = 'europe-west6';
const BATCH = 400;

interface CollectionResult {
  seen: number;
  changed: number;
}

/** Iterate a collection in id-ordered pages; runs `fn` per doc. Returns docs seen. */
async function forEachDoc(
  base: Query<DocumentData>,
  fn: (id: string, data: DocumentData) => Promise<void>,
): Promise<number> {
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

async function addTenant(
  collection: string,
  tenantId: string,
  dryRun: boolean,
): Promise<CollectionResult> {
  const db = getFirestore();
  const result: CollectionResult = { seen: 0, changed: 0 };
  result.seen = await forEachDoc(db.collection(collection), async (id, data) => {
    const tenants: unknown = data['tenants'];
    // a document with no tenants array at all is a data defect, not our business to repair
    if (!Array.isArray(tenants) || tenants.includes(tenantId)) return;
    result.changed++;
    if (!dryRun) {
      await db.collection(collection).doc(id).update({ tenants: [...tenants, tenantId] });
    }
  });
  return result;
}

/**
 * Adds a tenant id to every person and every address, so that a personal tenant can resolve
 * the people and places its owner refers to (design 2026-08-22-diary-import-design, V1).
 *
 * This dissolves the tenant isolation of the target tenant: afterwards it *contains* the whole
 * directory including the address PII vault. It is only defensible while that tenant has a
 * single user. Adding a second one means reverting this first.
 *
 * Defaults to a dry run. Pass `{ dryRun: false }` explicitly to write. Idempotent either way:
 * a document that already carries the tenant is skipped.
 */
export const addTenantToDirectory = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request) => {
    checkAppCheckToken(request, 'addTenantToDirectory');
    checkAuthentication(request, 'addTenantToDirectory');
    await checkAdminRole(request, 'addTenantToDirectory');

    const tenantId = String(request.data?.tenantId ?? '').trim();
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'tenantId is required');
    }
    const dryRun = request.data?.dryRun !== false;

    const persons = await addTenant(PersonCollection, tenantId, dryRun);
    const addresses = await addTenant(AddressCollection, tenantId, dryRun);

    const result = { dryRun, tenantId, persons, addresses };
    logger.info('addTenantToDirectory: done', result);
    return result;
  },
);
