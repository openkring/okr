// apps/functions/src/person/resync-vault-replicas.ts
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Query, DocumentData } from 'firebase-admin/firestore';

import { AddressCollection, AddressModel, PersonCollection } from '@okr/shared-models';
import {
  checkAdminRole, checkAppCheckToken, checkAuthentication,
  syncBirthYearReplicas, syncDateOfDeathReplicas,
} from '@okr/shared-util-functions';

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
 * Re-derive every degraded-precision vault replica from the persons' LIVE addresses.
 * Admin-only, idempotent — a person whose replicas already match is not written.
 *
 * Why this exists: until 2026-07-27 `onAddressChange` derived the replicas from the
 * changed address document instead of the vault, so archiving a dob/dod address (the
 * app's delete is a soft delete) left `memberBirthYear` / `isDeceased` / `deathYear`
 * populated forever, and duplicate scalar docs let the last write win. The fixed
 * trigger only repairs a person on their NEXT address write; this sweeps the rest.
 *
 * ⚠️ RUN ORDER: `migrateDateOfDeath` MUST have completed first. This function treats
 * "no live dod address" as "not deceased", so running it against un-migrated data
 * would clear `isDeceased`/`deathYear` for everyone whose date of death still sits on
 * the legacy `persons.dateOfDeath` field.
 */
export const resyncVaultReplicas = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request): Promise<{ persons: number; documentsWritten: number }> => {
    checkAppCheckToken(request, 'resyncVaultReplicas');
    checkAuthentication(request, 'resyncVaultReplicas');
    await checkAdminRole(request, 'resyncVaultReplicas');

    const db = getFirestore();
    let documentsWritten = 0;

    const persons = await forEachDocId(db.collection(PersonCollection), async (personId) => {
      // load ALL addresses (incl. archived): the live ones derive the replica, the full
      // set is the `evidence` that tells a deleted value from one the vault never held
      const snap = await db.collection(AddressCollection).where('parentKey', '==', `person.${personId}`).get();
      const all = snap.docs.map((d) => ({ ...d.data(), okey: d.id } as AddressModel));
      const live = all.filter((a) => a.isArchived !== true);
      documentsWritten += await syncBirthYearReplicas(db, personId, live, all);
      documentsWritten += await syncDateOfDeathReplicas(db, personId, live, all);
    });

    logger.info(`resyncVaultReplicas: done`, { persons, documentsWritten });
    return { persons, documentsWritten };
  },
);
