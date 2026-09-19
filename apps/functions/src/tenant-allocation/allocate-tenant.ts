import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import {
  AddressCollection, AllocationDirection, allocationSubjectKey, AllocationSubjectType,
  AppConfigCollection, AvatarCollection, TenantAllocationLogCollection, TenantAllocationLogModel,
} from '@okr/shared-models';
import {
  checkAdminRole, checkAppCheckToken, getCallerTenantId, writeAddressDirectory,
} from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { openAccount } from '../auth/account-sync';

import { AllocationDoc, buildAllocationPlan, SUBJECT_COLLECTION } from './allocation-plan';

const REGION = 'europe-west6';

// Firestore batches cap at 500 writes; person + addresses + avatars + the log entry is
// unbounded on the client's selection. Chunking (like erasure-execute.ts does) would cost
// the log its atomicity with the mutations it is evidence for, so this refuses instead of
// splitting.
const MAX_BATCH_WRITES = 450;

export interface AllocateTenantRequest {
  /** D-TA-7, widened 2026-09-19: persons, orgs and resources. */
  readonly modelType: AllocationSubjectType;
  readonly okey: string;
  readonly targetTenantId: string;
  readonly direction: AllocationDirection;
  readonly addressKeys: string[];
  readonly includeAvatar: boolean;
  readonly includeSubject: boolean;
  /** Open a user account for the person in the TARGET tenant. Grants on a person only. */
  readonly createAccount?: boolean;
  /** The address the account logs in with. Must be one of `addressKeys`. */
  readonly loginEmail?: string;
}

/** What became of the "open an account too" request, if there was one. */
export interface AllocateTenantAccount {
  readonly created: boolean;
  readonly loginEmail?: string;
  /** Why nothing was created. `exists` covers both an Auth identity that is already a user
   * somewhere and a users/{uid} document that is already there. */
  readonly reason?: 'notRequested' | 'notAGrant' | 'notAPerson' | 'notSelected' | 'exists' | 'noEmail' | 'noPerson' | 'failed';
}

export interface AllocateTenantResponse {
  /** Documents touched, per collection — the subject's own collection, addresses, avatars. */
  readonly changed: Record<string, number>;
  readonly rejected: { okey: string; reason: string }[];
  readonly logKey: string;
  readonly account: AllocateTenantAccount;
}

/** A document id: a non-empty string with no path separator — a `/` would resolve to a
 * document in a subcollection under the intended collection instead of a sibling doc. */
function isCleanKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('/');
}

/** The three model types this callable can move. Anything else is a malformed request. */
function isSubjectType(value: unknown): value is AllocationSubjectType {
  return value === 'person' || value === 'org' || value === 'resource';
}

/**
 * Move a person, an org or a resource between tenants (spec 1.47, D-TA-7).
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
  if (!isSubjectType(data?.modelType)) {
    throw new HttpsError('invalid-argument', 'Dieser Datensatztyp lässt sich nicht zuteilen.');
  }
  const modelType = data.modelType;
  // Resources have no `addresses` vault — a selection for one could only have been fabricated,
  // and every key in it would be rejected as a foreign parent anyway. Refuse it as the
  // malformed request it is rather than returning a page of rejections.
  if (modelType === 'resource' && (data.addressKeys?.length ?? 0) > 0) {
    throw new HttpsError('invalid-argument', 'Ressourcen haben keine Adressen.');
  }
  if (!isCleanKey(data.okey) || !isCleanKey(data.targetTenantId)) {
    throw new HttpsError('invalid-argument', 'Datensatz und Zielmandant müssen angegeben sein.');
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

  const subjectCollection = SUBJECT_COLLECTION[modelType];
  const subjectSnap = await db.collection(subjectCollection).doc(data.okey).get();
  if (!subjectSnap.exists) {
    throw new HttpsError('not-found', 'Diesen Datensatz gibt es nicht.');
  }

  const toDoc = (id: string, docData: Record<string, unknown> | undefined): AllocationDoc => ({
    okey: id,
    tenants: (docData?.['tenants'] as string[] | undefined) ?? [],
    parentKey: (docData?.['parentKey'] as string | undefined) ?? '',
    channel: docData?.['addressChannel'] as string | undefined,
  });

  // `person.<okey>` / `org.<okey>` — the same shape identifies the addresses AND the avatar.
  const subjectKey = allocationSubjectKey(modelType, data.okey);
  const addressSnap = modelType === 'resource'
    ? undefined
    : await db.collection(AddressCollection).where('parentKey', '==', subjectKey).get();
  const addressDocs = addressSnap?.docs ?? [];

  // Only the bare `<prefix>.<okey>` document can ever help the target tenant: `AvatarService`
  // streams `tenants array-contains-any [currentTenant, 'system']` and resolves
  // `avatarDocId(currentTenant, key) ?? key` (avatar.service.ts:54,172) — the TARGET reads
  // either its OWN tenant-prefixed doc or the bare one, never the ACTOR's prefixed doc. So
  // stamping `<actorTenantId>.person.<okey>` would tag a document the target can never read.
  // This also removes a confusing rejection: when the bare doc is the shared default
  // (`tenants: ['system']`), it fails the actor-carries-it check and needs no action anyway —
  // `'system'` is already in every tenant's avatar stream.
  const avatarSnap = data.includeAvatar ? await db.collection(AvatarCollection).doc(subjectKey).get() : undefined;
  const avatarSnaps = avatarSnap?.exists ? [avatarSnap] : [];

  const plan = buildAllocationPlan({
    direction: data.direction,
    modelType,
    subjectKey: data.okey,
    actorTenantId,
    targetTenantId: data.targetTenantId,
    includeSubject: data.includeSubject !== false,
    includeAvatar: data.includeAvatar === true,
    subject: toDoc(subjectSnap.id, subjectSnap.data()),
    addresses: addressDocs.map((d) => toDoc(d.id, d.data())),
    avatars: avatarSnaps.map((d) => toDoc(d.id, d.data())),
    selectedAddressKeys: rawAddressKeys,
  });

  // ── the optional user account for the TARGET tenant (spec 1.47) ──────────────────────
  // The client names an address, it never supplies one. So the login email is resolved from
  // the documents re-read above, and only from an address that is actually travelling: an
  // account whose loginEmail points at an address the target tenant never received would be
  // a login that tenant cannot see, support or correct.
  const requestedEmail = (data.loginEmail ?? '').trim().toLowerCase();
  const selectedKeys = new Set(rawAddressKeys);
  const loginAddress = addressDocs.find((d) => {
    const a = d.data();
    return selectedKeys.has(d.id)
      && a['addressChannel'] === 'email'
      && a['isArchived'] !== true
      && ((a['tenants'] as string[] | undefined) ?? []).includes(actorTenantId)
      && ((a['email'] as string | undefined) ?? '').trim().toLowerCase() === requestedEmail;
  });

  /**
   * Runs AFTER the allocation, never as part of it: the transfer is the primary act and must
   * not be rolled back or reported as failed because an account could not be opened. Every
   * outcome is reported instead of thrown, so the admin sees what happened to both halves.
   *
   * Idempotent by way of `openAccount`, which returns early on an existing users/{uid} — that
   * is also why it runs on the nothing-to-change path: re-running a completed allocation to
   * add the account the admin forgot the first time is a legitimate use.
   */
  const openTargetAccount = async (): Promise<AllocateTenantAccount> => {
    if (data.createAccount !== true) return { created: false, reason: 'notRequested' };
    if (data.direction !== 'grant') return { created: false, reason: 'notAGrant' };
    // An account belongs to a natural person — `openAccount` resolves the login from an email
    // address of that person and writes `users/{uid}.personKey`. There is nothing to resolve
    // for an org or a resource, so the request is reported as refused, not attempted.
    if (modelType !== 'person') return { created: false, reason: 'notAPerson' };
    if (!requestedEmail || !loginAddress) return { created: false, reason: 'notSelected' };
    try {
      const email = ((loginAddress.data()['email'] as string | undefined) ?? '').trim();
      const result = await openAccount(data.okey, data.targetTenantId, email);
      return result.outcome === 'created'
        ? { created: true, loginEmail: result.loginEmail }
        : { created: false, reason: result.outcome };
    } catch (ex) {
      // No email in the log — PII (privacy inventory §7.2).
      logger.error(`allocateTenant: opening the account in ${data.targetTenantId} failed`, ex);
      return { created: false, reason: 'failed' };
    }
  };

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
      account: await openTargetAccount(),
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
    modelType,
    subjectKey: data.okey,
    actorUid: uid,
    executedAt: getTodayStr(DateFormat.StoreDateTime),
    channels: plan.channels,
    counts: plan.counts,
  };
  const logRef = db.collection(TenantAllocationLogCollection).doc();
  batch.set(logRef, { ...log, okey: logRef.id });

  await batch.commit();

  // Only this record's own projection changed — rebuilding the WHOLE target tenant
  // (rebuildDirectoryForTenant) would re-project every person and org of that tenant,
  // sequentially, on every single allocation, which can blow the callable's deadline on a
  // mid-size tenant. The batch above has already committed by this point, so a failure here
  // must not fail the call — the transfer happened; only the read-side projection is stale
  // until the next write to one of this record's addresses. Resources have no addresses and
  // therefore no projection.
  if (modelType !== 'resource') {
    try {
      await writeAddressDirectory(db, subjectKey);
    } catch (ex) {
      logger.error(`allocateTenant: directory rebuild for ${subjectKey} failed`, ex);
    }
  }

  // No subject key in Cloud Logging, matching the erasure callables — model type, direction,
  // both tenant ids and counts are enough to operate on.
  const account = await openTargetAccount();

  logger.info(`allocateTenant: ${modelType} ${data.direction} ${actorTenantId} -> ${data.targetTenantId}`, { ...plan.counts, account: account.created });
  return {
    changed: plan.counts,
    rejected: plan.rejections.map((r) => ({ okey: r.okey, reason: r.reason })),
    logKey: logRef.id,
    account,
  };
});
