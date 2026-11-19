/**
 * Trigger `onTrainerAgreementWritten` (spec 1.167 §5.2): `trainer-profiles/{personKey}.tenants` is the union of the tenants
 * of all non-archived agreements of the person (the rules let the treasurer of a tenant read the profile through it).
 * It is recomputed from a query, never from the written document alone, so an exited or anonymised agreement
 * (personKey '') cannot re-add a tenant. A changed personKey recomputes both persons. The profile is created with the
 * model defaults only when there is at least one tenant; an existing profile gets only `tenants` and is never deleted
 * (erasure does that).
 */
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { TrainerAgreementCollection, TrainerProfileCollection, TrainerProfileModel } from '@okr/shared-models';

/** Pure: sorted unique union of the tenants of the non-archived agreements. */
export function profileTenants(agreements: { tenants: string[]; isArchived: boolean }[]): string[] {
  const set = new Set<string>();
  for (const a of agreements) {
    if (a.isArchived) continue;
    for (const t of a.tenants ?? []) if (t) set.add(t);
  }
  return [...set].sort();
}

export async function syncProfileTenants(db: Firestore, personKey: string): Promise<void> {
  if (!personKey) return;
  const profileRef = db.collection(TrainerProfileCollection).doc(personKey);
  await db.runTransaction(async (tx) => {
    const agreements = await tx.get(db.collection(TrainerAgreementCollection).where('personKey', '==', personKey));
    const profileSnap = await tx.get(profileRef);
    const tenants = profileTenants(agreements.docs.map((d) => ({
      tenants: Array.isArray(d.get('tenants')) ? (d.get('tenants') as string[]) : [],
      isArchived: d.get('isArchived') === true,
    })));
    if (profileSnap.exists) {
      const stored = profileSnap.get('tenants');
      if (Array.isArray(stored) && stored.length === tenants.length && stored.every((t, i) => t === tenants[i])) return;
      tx.update(profileRef, { tenants });
    } else if (tenants.length > 0) {
      const { okey: _okey, ...defaults } = new TrainerProfileModel(tenants[0]);
      void _okey;
      tx.set(profileRef, { ...defaults, tenants });
    } else {
      return;
    }
    logger.info(`onTrainerAgreementWritten: profile ${personKey} tenants [${tenants.join(',')}]`);
  });
}

export const onTrainerAgreementWritten = onDocumentWritten({ document: `${TrainerAgreementCollection}/{id}`, region: 'europe-west6' }, async (event) => {
  const beforeKey = event.data?.before?.exists ? String(event.data.before.get('personKey') ?? '') : '';
  const afterKey = event.data?.after?.exists ? String(event.data.after.get('personKey') ?? '') : '';
  const db = getFirestore();
  for (const key of new Set([beforeKey, afterKey])) await syncProfileTenants(db, key);
});
