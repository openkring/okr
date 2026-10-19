/**
 * One-off admin callable (spec 1.105): opens settlement tasks for exits saved before the trigger
 * existed. Same create path as the trigger (`openOrUpdateSettlementTask`), which skips done and
 * claimed tasks. `dryRun` computes what would happen with the same decision function
 * (`settlementTaskDecision`) and writes nothing. A reopened auto-closed task counts as updated, a
 * squatted doc overwritten with a fresh task as created. The tenant is the validated caller tenant;
 * the books are found via ownerKey (`loadExitContext`), a membership without unique books is skipped.
 */
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { MembershipCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';
import { computeExitSettlement } from '@okr/relationship-membership-util';

import { selectBackfillMemberships } from './backfill-exit-settlements.logic';
import { isExitContext, loadExitContext, readSettlementTask } from './exit-settlement.context';
import { openOrUpdateSettlementTask, settlementTaskDecision, UpsertDecision } from './exit-settlement.trigger';

const REGION = 'europe-west6';
const CF_NAME = 'backfillExitSettlements';

export interface BackfillData {
  tenantId: string;
  dryRun?: boolean;
}

export interface BackfillResult {
  created: string[];
  updated: string[];
  skipped: string[];
}

export const backfillExitSettlements = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, timeoutSeconds: 540 },
  async (request: CallableRequest<BackfillData>): Promise<BackfillResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['admin']);
    const callerTenant = await getCallerTenantId(request as never, CF_NAME);

    const { tenantId, dryRun } = request.data ?? ({} as Partial<BackfillData>);
    if (typeof tenantId !== 'string' || !tenantId.trim()) throw new HttpsError('invalid-argument', 'tenantId is required');
    if (tenantId !== callerTenant) throw new HttpsError('permission-denied', 'tenantId must be the caller tenant');

    const db = getFirestore();
    const today = getTodayStr(DateFormat.StoreDate);
    const snap = await db.collection(MembershipCollection).where('tenants', 'array-contains', tenantId).get();
    const keys = selectBackfillMemberships(
      snap.docs.map(d => ({ ...(d.data() as { tenants?: string[]; dateOfExit?: string; isArchived?: boolean }), okey: d.id })), tenantId, today);

    const result: BackfillResult = { created: [], updated: [], skipped: [] };
    for (const key of keys) {
      try {
        const ctx = await loadExitContext(db, key, tenantId, today);
        if (!isExitContext(ctx)) { logger.info(`${CF_NAME}: membership ${key} skipped: ${ctx}`); result.skipped.push(key); continue; }
        const settlement = computeExitSettlement(ctx.input);
        const decision: UpsertDecision = dryRun === true
          ? settlementTaskDecision(settlement, await readSettlementTask(db, tenantId, key), tenantId, key)
          : await openOrUpdateSettlementTask(db, ctx, settlement);
        if (decision === 'create' || decision === 'replace') result.created.push(key);
        else if (decision === 'noop') result.skipped.push(key);
        else result.updated.push(key);
      } catch (err) {
        logger.error(`${CF_NAME}: membership ${key} failed`, err);
        result.skipped.push(key);
      }
    }
    logger.info(`${CF_NAME}: tenant ${tenantId} dryRun=${dryRun === true} created=${result.created.length} updated=${result.updated.length} skipped=${result.skipped.length}`);
    return result;
  },
);
