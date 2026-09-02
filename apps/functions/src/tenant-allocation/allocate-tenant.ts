import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import {
  AddressCollection, AllocationDirection, AppConfigCollection, AvatarCollection,
  PersonCollection, TenantAllocationLogCollection, TenantAllocationLogModel,
} from '@okr/shared-models';
import {
  checkAdminRole, checkAppCheckToken, getCallerTenantId, writeAddressDirectory,
} from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { AllocationDoc, buildAllocationPlan } from './allocation-plan';

const REGION = 'europe-west6';

// Firestore batches cap at 500 writes; person + addresses + avatars + the log entry is
// unbounded on the client's selection. Chunking (like erasure-execute.ts does) would cost
// the log its atomicity with the mutations it is evidence for, so this refuses instead of
// splitting.
const MAX_BATCH_WRITES = 450;

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

/** A document id: a non-empty string with no path separator — a `/` would resolve to a
 * document in a subcollection under the intended collection instead of a sibling doc. */
function isCleanKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('/');
}

/**
 * Move a person between tenants (spec 1.47).
 *
 * Everything the plan builder decides on is re-read here first: the client's selection names
 * documents, it never supplies their contents. The acting tenant comes from `users/{uid}`,
 * never from the payload — a client can send any string, and trusting one would turn this
 * into a cross-tenant write primitive for anybody with an account.
 */
export const allocateTenant = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request): Promise<AllocateTenantResponse> => {
  // belt and braces, matching the other admin callables (rebuildAddressDirectory, erasure-callables)
  checkAppCheckToken(request, 'allocateTenant');
  await checkAdminRole(request, 'allocateTenant');
  const actorTenantId = await getCallerTenantId(request, 'allocateTenant');
  const uid = request.auth?.uid ?? '';

  const data = request.data as AllocateTenantRequest;
  if (data?.modelType !== 'person') {
    throw new HttpsError('invalid-argument', 'Nur Personen lassen sich zurzeit zuteilen.');
  }
  if (!isCleanKey(data.okey) || !isCleanKey(data.targetTenantId)) {
    throw new HttpsError('invalid-argument', 'Person und Zielmandant müssen angegeben sein.');
  }
  if (data.direction !== 'grant' && data.direction !== 'revoke') {
    throw new HttpsError('invalid-argument', 'Unbekannte Richtung.');
  }
  const rawAddressKeys = data.addressKeys ?? [];
  if (!Array.isArray(rawAddressKeys) || !rawAddressKeys.every(isCleanKey)) {
    throw new HttpsError('invalid-argument', 'Ungültige Adress-Auswahl.');
  }
  // D-TA-4 / spec §3 step 2: a precondition, not a merely-empty result.
  if (data.targetTenantId === actorTenantId) {
    throw new HttpsError('invalid-argument', 'Der eigene Mandant kann nicht zugeteilt werden.');
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

  // Only the bare `person.<okey>` document can ever help the target tenant: `AvatarService`
  // streams `tenants array-contains-any [currentTenant, 'system']` and resolves
  // `avatarDocId(currentTenant, key) ?? key` (avatar.service.ts:54,172) — the TARGET reads
  // either its OWN tenant-prefixed doc or the bare one, never the ACTOR's prefixed doc. So
  // stamping `<actorTenantId>.person.<okey>` would tag a document the target can never read.
  // This also removes a confusing rejection: when the bare doc is the shared default
  // (`tenants: ['system']`), it fails the actor-carries-it check and needs no action anyway —
  // `'system'` is already in every tenant's avatar stream.
  const avatarId = `person.${data.okey}`;
  const avatarSnap = data.includeAvatar ? await db.collection(AvatarCollection).doc(avatarId).get() : undefined;
  const avatarSnaps = avatarSnap?.exists ? [avatarSnap] : [];

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
    selectedAddressKeys: rawAddressKeys,
  });

  if (plan.writes.length + 1 > MAX_BATCH_WRITES) {
    throw new HttpsError('invalid-argument', 'Zu viele Adressen für eine einzelne Zuteilung.');
  }

  // Nothing to change (e.g. everything is already allocated the way it should be) — this is
  // idempotent, not an error. Skip the batch AND the log: a tenant-allocation-log entry
  // claiming a transfer that never happened would land in a collection the data subject can
  // export, and it is evidence for nothing.
  if (plan.writes.length === 0) {
    return {
      changed: plan.counts,
      rejected: plan.rejections.map((r) => ({ okey: r.okey, reason: r.reason })),
      logKey: '',
    };
  }

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

  // Only this person's own projection changed — rebuilding the WHOLE target tenant
  // (rebuildDirectoryForTenant) would re-project every person and org of that tenant,
  // sequentially, on every single-person allocation, which can blow the callable's deadline
  // on a mid-size tenant. The batch above has already committed by this point, so a failure
  // here must not fail the call — the transfer happened; only the read-side projection is
  // stale until the next write to one of this person's addresses.
  try {
    await writeAddressDirectory(db, `person.${data.okey}`);
  } catch (ex) {
    logger.error(`allocateTenant: directory rebuild for person.${data.okey} failed`, ex);
  }

  // No personKey in Cloud Logging, matching the erasure callables — direction, both tenant
  // ids and counts are enough to operate on.
  logger.info(`allocateTenant: ${data.direction} ${actorTenantId} -> ${data.targetTenantId}`, plan.counts);
  return { changed: plan.counts, rejected: plan.rejections.map((r) => ({ okey: r.okey, reason: r.reason })), logKey: logRef.id };
});
