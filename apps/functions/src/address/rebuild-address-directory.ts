// apps/functions/src/address/rebuild-address-directory.ts
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Query, DocumentData } from 'firebase-admin/firestore';

import { OrgCollection, PersonCollection } from '@okr/shared-models';
import { checkAdminRole, checkAppCheckToken, checkAuthentication, writeAddressDirectory } from '@okr/shared-util-functions';

const REGION = 'europe-west6';
const BATCH = 400;

/** Iterate a collection in id-ordered pages; runs `fn` per doc id. Returns docs seen. */
async function forEachDocId(base: Query<DocumentData>, fn: (id: string) => Promise<unknown>): Promise<number> {
  let last: string | undefined;
  let seen = 0;
  for (;;) {
    let q = base.orderBy('__name__').limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      await fn(doc.id);
      seen++;
    }
    last = snap.docs[snap.docs.length - 1].id;
    if (snap.size < BATCH) break;
  }
  return seen;
}

/**
 * Rebuild the entire address-directory projection (spec 1.19 Phase 4). Admin-only,
 * idempotent — run it for the initial backfill and after any change to the
 * projection logic itself: every existing doc was written by the OLD
 * buildDirectoryDoc and stays stale until its parent's next address write fires
 * the trigger. The favorite-only reduction (2026-07-27) is such a change —
 * deploy, then run this.
 *
 * A tenant changing its AppConfig privacy floors no longer needs a manual run:
 * `onAppConfigChange` rebuilds that tenant automatically (rebuildDirectoryForTenant).
 *
 * **D-L1 (spec 1.23) made the projection provenance-scoped**, which is exactly such a
 * change: every existing doc was built from ALL of a parent's addresses, including other
 * tenants'. This callable is the required post-deploy run — and it answers 1.23's open
 * question while it runs: `crossTenantAddresses` counts the (tenant × address) pairs the
 * new filter removed, `parentsAffected` the persons/orgs that were being served
 * cross-tenant. Both are 0 on every later run.
 */
export const rebuildAddressDirectory = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request): Promise<{ persons: number; orgs: number; crossTenantAddresses: number; parentsAffected: number }> => {
    checkAppCheckToken(request, 'rebuildAddressDirectory');
    checkAuthentication(request, 'rebuildAddressDirectory');
    await checkAdminRole(request, 'rebuildAddressDirectory');

    const db = getFirestore();
    let crossTenantAddresses = 0;
    let parentsAffected = 0;
    const rebuild = async (parentKey: string) => {
      const { crossTenant } = await writeAddressDirectory(db, parentKey);
      crossTenantAddresses += crossTenant;
      if (crossTenant > 0) parentsAffected++;
    };
    const persons = await forEachDocId(db.collection(PersonCollection), (id) => rebuild(`person.${id}`));
    const orgs = await forEachDocId(db.collection(OrgCollection), (id) => rebuild(`org.${id}`));

    logger.info(`rebuildAddressDirectory: rebuilt projections for ${persons} persons and ${orgs} orgs; `
      + `${crossTenantAddresses} cross-tenant addresses dropped across ${parentsAffected} parents (D-L1)`);
    return { persons, orgs, crossTenantAddresses, parentsAffected };
  },
);
