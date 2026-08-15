// apps/functions/src/approval/index.ts
//
// The approval step of the workflow spine
// (planning/specs/2026-08-15-approval-workflow-spec.md §3.3 / §3.4).
//
// Modelled on reviewBooking: App Check, authentication, tenant derived from the CALLER
// (never from the payload), idempotent on an already-decided record. The `approvals`
// collection is CF-write-only in firestore.rules — a decision a client could write
// directly is not an audit trail.

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { ApprovalCollection, ApprovalState, MAX_DECISION_NOTE_LENGTH } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { emitEvent } from '../workflow/emit';
import { resolveWriteBack } from './write-back';

const REGION = 'europe-west6';
const CF_NAME = 'decideApproval';
const TASK_COLLECTION = 'tasks';

interface DecideApprovalData {
  approvalKey: string;
  decision: 'approve' | 'reject' | 'withdraw';
  note?: string;
}

const OUTCOME: Record<DecideApprovalData['decision'], ApprovalState> = {
  approve: 'approved',
  reject: 'rejected',
  withdraw: 'withdrawn',
};

/**
 * Record one decision.
 *
 * Who may decide: the SNAPSHOTTED approver, or a tenant admin. Not the requester, and not
 * whoever merely holds the responsibility right now — the approver was captured when the
 * approval was requested precisely so a handover cannot silently move a pending decision.
 * `withdraw` is the exception: it is a cancellation, so the requester may do it too.
 */
export const decideApproval = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<DecideApprovalData>): Promise<{ state: ApprovalState }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const { approvalKey, decision } = request.data ?? {};
    if (!approvalKey || !OUTCOME[decision]) {
      throw new HttpsError('invalid-argument', 'approvalKey and decision (approve|reject|withdraw) are required');
    }
    const note = (request.data.note ?? '').trim().slice(0, MAX_DECISION_NOTE_LENGTH);
    if (decision === 'reject' && note.length === 0) {
      throw new HttpsError('invalid-argument', 'a note is required to reject');
    }

    const db = getFirestore();
    const ref = db.collection(ApprovalCollection).doc(approvalKey);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', `approval ${approvalKey} not found`);
    const approval = snap.data() ?? {};

    if (!((approval['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw new HttpsError('permission-denied', 'approval belongs to another tenant');
    }

    // Already decided — return the current state rather than deciding twice, so a retry
    // after a dropped response is harmless.
    const current = (approval['state'] as ApprovalState) ?? 'pending';
    if (current !== 'pending') return { state: current };

    const uid = request.auth!.uid;
    const callerPersonKey = (await db.collection('users').doc(uid).get()).data()?.['personKey'] as string ?? '';
    const isAdmin = await hasAdminRole(db, uid);
    const approverKey = (approval['approver'] as { key?: string } | undefined)?.key ?? '';
    const requesterKey = (approval['requestedBy'] as { key?: string } | undefined)?.key ?? '';

    const mayDecide = isAdmin || (callerPersonKey !== '' && callerPersonKey === approverKey);
    const mayWithdraw = mayDecide || (callerPersonKey !== '' && callerPersonKey === requesterKey);
    if (decision === 'withdraw' ? !mayWithdraw : !mayDecide) {
      throw new HttpsError('permission-denied', 'not allowed to decide this approval');
    }

    const state = OUTCOME[decision];
    await ref.set({
      state,
      decisionDate: getTodayStr(DateFormat.StoreDateTime),
      decisionNote: note,
    }, { merge: true });

    // The approver's task is done — or cancelled, when the request was withdrawn.
    const taskKey = (approval['taskKey'] as string) ?? '';
    if (taskKey) {
      await db.collection(TASK_COLLECTION).doc(taskKey).set(
        { state: decision === 'withdraw' ? 'cancelled' : 'done' },
        { merge: true },
      );
    }

    logger.info(`${CF_NAME}: ${approvalKey} → ${state} by ${callerPersonKey || uid}`);
    return { state };
  },
);

async function hasAdminRole(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const roles = (await db.collection('users').doc(uid).get()).data()?.['roles'] as Record<string, boolean> | undefined;
  return roles?.['admin'] === true;
}

/**
 * The outcome feeds back into the record — in two ways, and the split is deliberate:
 *
 *  (a) a WHITELISTED state patch (write-back.ts). The rule picks whether a field is
 *      patched; the value comes from a table in code.
 *  (b) an `approval.decided` event carrying the SUBJECT's key, so every follow-up
 *      consequence — notify the requester, mail the confirmation, invoice the member —
 *      stays an ordinary rule with a `decisionIs` probe instead of a fourth bespoke
 *      approval path.
 *
 * Runs on update only, and only on a pending→decided transition: an edit to a decided
 * approval must not re-fire the consequences.
 */
export const onApprovalDecided = onDocumentUpdated(
  { document: `${ApprovalCollection}/{id}`, region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if ((before['state'] ?? 'pending') !== 'pending') return;

    const state = (after['state'] as ApprovalState) ?? 'pending';
    if (state === 'pending') return;

    const db = getFirestore();
    const tenantId = ((after['tenants'] as string[] | undefined) ?? [])[0] ?? '';
    const subjectKey = (after['subjectKey'] as string) ?? '';
    const okey = subjectKey.slice(subjectKey.indexOf('.') + 1);

    const target = resolveWriteBack((after['writeBack'] as string) ?? '', state);
    if (target && okey) {
      await db.collection(target.collection).doc(okey).set({ [target.field]: target.value }, { merge: true });
      logger.info(`onApprovalDecided: ${subjectKey} ${target.field}=${target.value}`);
    } else if ((after['writeBack'] as string) && !target && state !== 'withdrawn') {
      logger.warn(`onApprovalDecided: refused write-back '${after['writeBack']}' — not in the allowed table`);
    }

    // The event carries the SUBJECT's key, not the approval's: a follow-up rule reasons
    // about the reservation or application, not about the approval bookkeeping.
    await emitEvent('approval.decided', tenantId, subjectKey, {
      subjectName: (after['subjectName'] as string) ?? '',
      params: {
        decision: state,
        kind: (after['kind'] as string) ?? '',
        approvalKey: event.params['id'],
        approverName: avatarName(after['approver']),
        note: (after['decisionNote'] as string) ?? '',
      },
    });
  },
);

function avatarName(avatar: unknown): string {
  const a = avatar as { name1?: string; name2?: string } | undefined;
  return `${a?.name1 ?? ''} ${a?.name2 ?? ''}`.trim();
}
