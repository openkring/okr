// apps/functions/src/address/rebuild-address-directory.ts
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Query, DocumentData } from 'firebase-admin/firestore';

import { OrgCollection, PersonCollection } from '@okr/shared-models';
import { checkAdminRole, checkAppCheckToken, checkAuthentication, writeAddressDirectory } from '@okr/shared-util-functions';

const REGION = 'europe-west6';
const BATCH = 400;

/** Iterate a collection in id-ordered pages; runs `fn` per doc id. Returns docs seen. */
async function forEachDocId(base: Query<DocumentData>, fn: (id: string) => Promise<void>): Promise<number> {
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
 */
export const rebuildAddressDirectory = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request): Promise<{ persons: number; orgs: number }> => {
    checkAppCheckToken(request, 'rebuildAddressDirectory');
    checkAuthentication(request, 'rebuildAddressDirectory');
    await checkAdminRole(request, 'rebuildAddressDirectory');

    const db = getFirestore();
    const persons = await forEachDocId(db.collection(PersonCollection),
      (id) => writeAddressDirectory(db, `person.${id}`));
    const orgs = await forEachDocId(db.collection(OrgCollection),
      (id) => writeAddressDirectory(db, `org.${id}`));

    logger.info(`rebuildAddressDirectory: rebuilt projections for ${persons} persons and ${orgs} orgs`);
    return { persons, orgs };
  },
);
