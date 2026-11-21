/**
 * Callable `saveHousehold({ tenantId, household, archive? })` (spec 1.168 §4.2, §7–§9): the ONLY write path of
 * `households` (rules: no client writes). Order: caller from `users/{uid}` (roles are never minted as claims) →
 * tenant binding → ONE transaction that reads the stored doc and the tenant's active households of the incoming
 * members, runs the refusal and shape checks and writes.
 */
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { HouseholdCollection, HouseholdModel } from '@okr/shared-models';
import { addIndexElement, householdShapeError, householdWriteRefusal } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { prepareHouseholdWrite } from './household.logic';

const REGION = 'europe-west6';
const CF_NAME = 'saveHousehold';
const IN_CHUNK = 30; // Firestore: at most 30 values in array-contains-any

export interface SaveHouseholdRequest {
  tenantId: string;
  household: HouseholdModel;
  archive?: boolean;
}

export interface HouseholdCaller {
  personKey: string;
  isAdmin: boolean;
}

/** Pure: the caller's tenants contain the request's tenant. */
export function callerInTenant(userTenants: unknown, tenantId: string): boolean {
  return tenantId !== '' && Array.isArray(userTenants) && userTenants.includes(tenantId);
}

/** Pure: memberAdmin, privileged or admin may add/remove members. */
export function isHouseholdAdmin(roles: Record<string, unknown>): boolean {
  return roles['memberAdmin'] === true || roles['privileged'] === true || roles['admin'] === true;
}

/** Pure: a tenants array that is exactly [tenantId]. */
export function isOnlyTenant(tenants: unknown, tenantId: string): boolean {
  return Array.isArray(tenants) && tenants.length === 1 && tenants[0] === tenantId;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** The client's household as a model: only known fields, coerced; `tenants` is overwritten by the caller. */
export function readIncoming(raw: unknown, tenantId: string): HouseholdModel | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const h = new HouseholdModel(tenantId);
  h.okey = typeof r['okey'] === 'string' ? r['okey'] : '';
  h.tenants = asStringArray(r['tenants']);
  h.isArchived = r['isArchived'] === true;
  h.name = typeof r['name'] === 'string' ? r['name'] : '';
  h.type = typeof r['type'] === 'string' ? r['type'] : '';
  h.tags = typeof r['tags'] === 'string' ? r['tags'] : h.tags;
  h.notes = typeof r['notes'] === 'string' ? r['notes'] : h.notes;
  h.memberKeys = asStringArray(r['memberKeys']);
  h.payerKey = typeof r['payerKey'] === 'string' ? r['payerKey'] : '';
  h.contactKey = typeof r['contactKey'] === 'string' ? r['contactKey'] : '';
  if (r['bundle'] !== null && typeof r['bundle'] === 'object') h.bundle = r['bundle'] as HouseholdModel['bundle'];
  else delete (h as Partial<HouseholdModel>).bundle;
  return h;
}

function toModel(okey: string, data: Record<string, unknown> | undefined, tenantId: string): HouseholdModel | undefined {
  if (!data) return undefined;
  const h = readIncoming({ ...data, okey }, tenantId);
  if (h) {
    h.tenants = asStringArray(data['tenants']);
    h.index = typeof data['index'] === 'string' ? data['index'] : '';
  }
  return h;
}

function refuse(code: string): never {
  throw new HttpsError('permission-denied', code);
}

export async function runSaveHousehold(db: Firestore, uid: string, req: SaveHouseholdRequest): Promise<{ okey: string }> {
  const tenantId = typeof req?.tenantId === 'string' ? req.tenantId : '';
  const user = (await db.collection('users').doc(uid).get()).data() ?? {};
  if (!callerInTenant(user['tenants'], tenantId)) refuse('tenant-not-allowed');
  const caller: HouseholdCaller = {
    personKey: typeof user['personKey'] === 'string' ? user['personKey'] : '',
    isAdmin: isHouseholdAdmin((user['roles'] as Record<string, unknown> | undefined) ?? {}),
  };
  if (caller.personKey === '' && !caller.isAdmin) refuse('not-allowed');

  const incoming = readIncoming(req.household, tenantId);
  if (!incoming) throw new HttpsError('invalid-argument', 'household is required');
  if (!isOnlyTenant(incoming.tenants, tenantId)) refuse('tenants-changed');
  const col = db.collection(HouseholdCollection);

  return db.runTransaction(async (tx) => {
    const key = incoming.okey;
    const beforeSnap = key ? await tx.get(col.doc(key)) : undefined;
    const beforeData = beforeSnap?.exists ? beforeSnap.data() : undefined;
    if (key && !beforeData && !caller.isAdmin) refuse('not-allowed');
    if (beforeData && !isOnlyTenant(beforeData['tenants'], tenantId)) refuse('tenants-changed');
    const before = key ? toModel(key, beforeData, tenantId) : undefined;

    // the index is server-side: carry the stored one over so a member's rename is not seen as a change
    if (before) incoming.index = before.index;

    const refusal = householdWriteRefusal(caller, before, incoming);
    if (refusal) refuse(refusal);

    const prepared = prepareHouseholdWrite(before, incoming);
    const doc = prepared.doc;
    const archive = prepared.archive || (caller.isAdmin && req.archive === true);

    // the tenant's other active households of the incoming members
    const others = new Map<string, HouseholdModel>();
    for (let i = 0; i < doc.memberKeys.length; i += IN_CHUNK) {
      // tenant and archive state are filtered here, not in the query: that keeps the query on the single-field index
      const snap = await tx.get(col.where('memberKeys', 'array-contains-any', doc.memberKeys.slice(i, i + IN_CHUNK)));
      for (const d of snap.docs) {
        if (d.id === key || d.get('isArchived') === true || !isOnlyTenant(d.get('tenants'), tenantId)) continue;
        const m = toModel(d.id, d.data(), tenantId);
        if (m) others.set(d.id, m);
      }
    }
    const shape = archive ? undefined : householdShapeError({ ...doc, okey: key }, [...others.values()]);
    if (shape) throw new HttpsError('invalid-argument', shape);

    const stored: Record<string, unknown> = { ...doc, tenants: [tenantId], isArchived: archive, index: addIndexElement('', 'n', doc.name.trim()) };
    const ref = key ? col.doc(key) : col.doc();
    tx.set(ref, stored);
    return { okey: ref.id };
  });
}

export const saveHousehold = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<SaveHouseholdRequest>): Promise<{ okey: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    return runSaveHousehold(getFirestore(), request.auth?.uid ?? '', request.data);
  },
);
