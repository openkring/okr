import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import {
  AddressCollection, AllocationDirection, AppConfigCollection, AvatarCollection,
  PersonCollection, TenantAllocationLogCollection, TenantAllocationLogModel,
} from '@okr/shared-models';
import {
  checkAdminRole, checkAppCheckToken, getCallerTenantId, rebuildDirectoryForTenant,
} from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { AllocationDoc, buildAllocationPlan } from './allocation-plan';

const REGION = 'europe-west6';

export interface AllocateTenantRequest {
  /** D-TA-7: the contract is wider than today's implementation on purpose. */
  readonly modelType: 'person';
  readonly okey: string;
  readonly targetTenantId: string;
  readonly direction: AllocationDirection;
  readonly addressKeys: string[];
  readonly includeAvatar: boolean;
  readonly includeSubject: boolean;
}

export interface AllocateTenantResponse {
  readonly changed: { persons: number; addresses: number; avatars: number };
  readonly rejected: { okey: string; reason: string }[];
  readonly logKey: string;
}

/**
 * Move a person between tenants (spec 1.47).
 *
 * Everything the plan builder decides on is re-read here first: the client's selection names
 * documents, it never supplies their contents. The acting tenant comes from `users/{uid}`,
 * never from the payload — a client can send any string, and trusting one would turn this
 * into a cross-tenant write primitive for anybody with an account.
 */
export const allocateTenant = onCall({ region: REGION }, async (request): Promise<AllocateTenantResponse> => {
  checkAppCheckToken(request, 'allocateTenant');
  await checkAdminRole(request, 'allocateTenant');
  const actorTenantId = await getCallerTenantId(request, 'allocateTenant');
  const uid = request.auth?.uid ?? '';

  const data = request.data as AllocateTenantRequest;
  if (data?.modelType !== 'person') {
    throw new HttpsError('invalid-argument', 'Nur Personen lassen sich zurzeit zuteilen.');
  }
  if (!data.okey || !data.targetTenantId) {
    throw new HttpsError('invalid-argument', 'Person und Zielmandant müssen angegeben sein.');
  }
  if (data.direction !== 'grant' && data.direction !== 'revoke') {
    throw new HttpsError('invalid-argument', 'Unbekannte Richtung.');
  }

  const db = getFirestore();

  const targetSnap = await db.collection(AppConfigCollection).doc(data.targetTenantId).get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'Diesen Mandanten gibt es nicht.');
  }

  const personSnap = await db.collection(PersonCollection).doc(data.okey).get();
  if (!personSnap.exists) {
    throw new HttpsError('not-found', 'Diese Person gibt es nicht.');
  }

  const toDoc = (id: string, docData: Record<string, unknown> | undefined): AllocationDoc => ({
    okey: id,
    tenants: (docData?.['tenants'] as string[] | undefined) ?? [],
    parentKey: (docData?.['parentKey'] as string | undefined) ?? '',
    channel: docData?.['addressChannel'] as string | undefined,
  });

  const parentKey = `person.${data.okey}`;
  const addressSnap = await db.collection(AddressCollection).where('parentKey', '==', parentKey).get();

  // A bare `'__name__' in [...]` filter compares against the FULL document path, not the bare
  // id, so it silently matches nothing here — two point reads instead.
  const avatarIds = [`person.${data.okey}`, `${actorTenantId}.person.${data.okey}`];
  const avatarSnaps = data.includeAvatar
    ? (await db.getAll(...avatarIds.map((id) => db.collection(AvatarCollection).doc(id)))).filter((s) => s.exists)
    : [];

  const plan = buildAllocationPlan({
    direction: data.direction,
    personKey: data.okey,
    actorTenantId,
    targetTenantId: data.targetTenantId,
    includeSubject: data.includeSubject !== false,
    includeAvatar: data.includeAvatar === true,
    person: toDoc(personSnap.id, personSnap.data()),
    addresses: addressSnap.docs.map((d) => toDoc(d.id, d.data())),
    avatars: avatarSnaps.map((d) => toDoc(d.id, d.data())),
    selectedAddressKeys: Array.isArray(data.addressKeys) ? data.addressKeys : [],
  });

  const batch = db.batch();
  const mutation = data.direction === 'grant'
    ? FieldValue.arrayUnion(data.targetTenantId)
    : FieldValue.arrayRemove(data.targetTenantId);
  for (const write of plan.writes) {
    batch.update(db.collection(write.collection).doc(write.okey), { tenants: mutation });
  }

  const log: TenantAllocationLogModel = {
    okey: '',
    tenants: [actorTenantId],
    isArchived: false,
    tenantId: actorTenantId,
    targetTenantId: data.targetTenantId,
    direction: data.direction,
    modelType: 'person',
    subjectKey: data.okey,
    actorUid: uid,
    executedAt: getTodayStr(DateFormat.StoreDateTime),
    channels: plan.channels,
    counts: plan.counts,
  };
  const logRef = db.collection(TenantAllocationLogCollection).doc();
  batch.set(logRef, { ...log, okey: logRef.id });

  await batch.commit();

  // Without this the target tenant's address-directory stays as it was until the next write
  // to one of its addresses — empty after a grant, still populated after a revoke (D-L1).
  try {
    await rebuildDirectoryForTenant(db, data.targetTenantId);
  } catch (ex) {
    logger.error(`allocateTenant: directory rebuild for ${data.targetTenantId} failed`, ex);
  }

  logger.info(`allocateTenant: ${data.direction} ${data.okey} ${actorTenantId} -> ${data.targetTenantId}`, plan.counts);
  return { changed: plan.counts, rejected: plan.rejections.map((r) => ({ okey: r.okey, reason: r.reason })), logKey: logRef.id };
});
