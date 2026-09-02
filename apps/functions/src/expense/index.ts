import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAppCheckToken, checkAuthentication, lockedExpenseFields, nextStatusForCompletedTask } from '@okr/shared-util-functions';
import { getTodayStr, DateFormat } from '@okr/shared-util-core';

import { emitEvent } from '../workflow/emit';

const REGION = 'europe-west6';
const CF_NAME = 'createExpense';
const EXPENSE_COLLECTION = 'expenses';
const USERS_COLLECTION = 'users';

interface CreateExpenseData {
  tenantId: string;
  abstract: string;
  amountTotal: number;   // cents
  currency: string;
  transferTo: 'me' | 'issuer';
  iban: string;
  category: string;
  costCenterId: string;
  note: string;
  receiptCount: number;
}

/**
 * Creates an expense document server-side with the caller as owner.
 * The client cannot write the `expenses` collection directly (CF-only rules) —
 * this callable is the only way to create one.
 */
export const createExpense = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<CreateExpenseData>): Promise<{ expenseKey: string }> => {
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    const uid = request.auth!.uid;
    const d = request.data;
    if (!d?.tenantId || typeof d.amountTotal !== 'number') {
      throw new HttpsError('invalid-argument', 'tenantId and amountTotal are required');
    }
    const db = getFirestore();
    // Resolve the caller's user doc → verify tenant membership + capture userId (the user okey = doc id).
    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists) throw new HttpsError('permission-denied', 'unknown user');
    const user = userSnap.data()!;
    if (!(user['tenants'] as string[] | undefined)?.includes(d.tenantId)) {
      throw new HttpsError('permission-denied', 'not a member of this tenant');
    }
    const receiptCount = Number.isInteger(d.receiptCount) && d.receiptCount >= 0 ? d.receiptCount : 0;
    const ref = db.collection(EXPENSE_COLLECTION).doc();
    await ref.set({
      tenants: [d.tenantId], isArchived: false, index: '', tags: '', notes: '',
      creationDateTime: getTodayStr(DateFormat.StoreDateTime),
      abstract: d.abstract ?? '',
      amountTotal: d.amountTotal, currency: d.currency || 'CHF',
      transferTo: d.transferTo === 'issuer' ? 'issuer' : 'me', iban: d.iban ?? '',
      category: d.category ?? '', costCenterId: d.costCenterId ?? '', note: d.note ?? '',
      status: 'processing', bookingKey: '',
      userId: uid, userName: `${user['firstName'] ?? ''} ${user['lastName'] ?? ''}`.trim(),
      personKey: (user['personKey'] as string) ?? '',
      ocrError: '', ocrErrorAt: '',
      accountingTenantId: d.tenantId,
      receiptCount,
    });
    logger.info(`createExpense: ${ref.id} for tenant ${d.tenantId} (receipts=${receiptCount})`);

    // `expenses` is CF-write-only, so this callable is the complete emit point — no
    // second trigger and no second definition of "created".
    await emitEvent('expense.created', d.tenantId, `expense.${ref.id}`, {
      personKey: (user['personKey'] as string) ?? '',
      subjectName: `${user['firstName'] ?? ''} ${user['lastName'] ?? ''}`.trim(),
      params: {
        amount: String(d.amountTotal),
        currency: d.currency || 'CHF',
        category: d.category ?? '',
        costCenterId: d.costCenterId ?? '',
      },
    });

    return { expenseKey: ref.id };
  },
);

/**
 * Soft-delete an expense (isArchived=true). The expenses collection is CF-write-only, so this is the
 * only client-reachable delete. Allowed for the expense's author (userId === caller) or a treasurer.
 */
export const deleteExpense = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ expenseKey: string }>): Promise<{ ok: true }> => {
    checkAppCheckToken(request as any, 'deleteExpense');
    checkAuthentication(request as any, 'deleteExpense');
    const uid = request.auth!.uid;
    const expenseKey = request.data?.expenseKey;
    if (!expenseKey) throw new HttpsError('invalid-argument', 'expenseKey is required');

    const db = getFirestore();
    const expSnap = await db.collection(EXPENSE_COLLECTION).doc(expenseKey).get();
    if (!expSnap.exists) throw new HttpsError('not-found', 'expense not found');
    const expense = expSnap.data()!;

    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    const user = userSnap.data() ?? {};
    const tenantId = (expense['tenants'] as string[] | undefined)?.[0] ?? '';
    const isMember = (user['tenants'] as string[] | undefined)?.includes(tenantId) ?? false;
    const isPrivileged = user['roles']?.['treasurer'] === true || user['roles']?.['admin'] === true;
    const isAuthor = expense['userId'] === uid;
    if (!isMember || !(isPrivileged || isAuthor)) {
      throw new HttpsError('permission-denied', 'not allowed to delete this expense');
    }

    await expSnap.ref.set({ isArchived: true }, { merge: true });
    return { ok: true };
  },
);

/** The fields a treasurer may change. Everything else on the document is owned by the pipeline. */
interface UpdateExpenseData {
  expenseKey: string;
  abstract?: string;
  amountTotal?: number;
  currency?: string;
  transferTo?: 'me' | 'issuer';
  category?: string;
  costCenterId?: string;
  note?: string;
  status?: string;
}

const EDITABLE_FIELDS = [
  'abstract', 'amountTotal', 'currency', 'transferTo', 'category', 'costCenterId', 'note', 'status',
] as const;

/**
 * The statuses a treasurer may set BY HAND — a strict subset of `ExpenseStatus`, mirroring
 * EXPENSE_EDIT_STATES in `expense.util.ts`. `posted` and `pending-export` belong to the booking
 * function, the only code that knows a booking actually landed; accepting them here would let a
 * treasurer mark an unbooked expense as posted with an empty `bookingKey` and no ledger entry,
 * after which `nextStatusForCompletedTask` would refuse to move it again. `draft` is written only
 * by the client-side model factory, before the expense exists here.
 */
const VALID_STATUS = ['processing', 'validated', 'error'];

/**
 * Treasurer edit. `expenses` is CF-write-only, so this is the only client-reachable update.
 *
 * Once the expense is booked the accounting fields are refused rather than silently dropped —
 * a treasurer who thinks they corrected an amount must find out that they did not.
 */
export const updateExpense = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<UpdateExpenseData>): Promise<{ ok: true }> => {
    checkAppCheckToken(request as any, 'updateExpense');
    checkAuthentication(request as any, 'updateExpense');
    const uid = request.auth!.uid;
    const d = request.data;
    if (!d?.expenseKey) throw new HttpsError('invalid-argument', 'expenseKey is required');

    const db = getFirestore();
    const expSnap = await db.collection(EXPENSE_COLLECTION).doc(d.expenseKey).get();
    if (!expSnap.exists) throw new HttpsError('not-found', 'expense not found');
    const expense = expSnap.data()!;

    const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
    const user = userSnap.data() ?? {};
    const tenantId = (expense['tenants'] as string[] | undefined)?.[0] ?? '';
    const isMember = (user['tenants'] as string[] | undefined)?.includes(tenantId) ?? false;
    const isPrivileged = user['roles']?.['treasurer'] === true || user['roles']?.['admin'] === true;
    if (!isMember || !isPrivileged) {
      throw new HttpsError('permission-denied', 'not allowed to edit this expense');
    }

    if (d.status !== undefined && !VALID_STATUS.includes(d.status)) {
      throw new HttpsError('invalid-argument', `unknown status '${d.status}'`);
    }

    const locked = lockedExpenseFields({ bookingKey: expense['bookingKey'] as string | undefined });
    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      const value = (d as Record<string, unknown>)[field];
      if (value === undefined) continue;
      if (locked.includes(field) && value !== expense[field]) {
        throw new HttpsError('failed-precondition', `'${field}' cannot be changed once the expense is booked`);
      }
      patch[field] = value;
    }
    // Moving the expense OFF 'error' clears the OCR failure with it. `ocrError` is deliberately
    // not an EDITABLE_FIELD (nobody hand-types an error message), but leaving it set would keep
    // the red banner on the detail page — and the stale text on the document — forever, since
    // only `redoExpenseOcr` clears it and redo is refused once `bookingKey` is set.
    if (d.status !== undefined && d.status !== 'error' && (expense['ocrError'] || expense['ocrErrorAt'])) {
      patch['ocrError'] = '';
      patch['ocrErrorAt'] = '';
    }

    if (Object.keys(patch).length === 0) return { ok: true };

    await expSnap.ref.set(patch, { merge: true });
    logger.info(`updateExpense: ${d.expenseKey} patched [${Object.keys(patch).join(', ')}]`);
    return { ok: true };
  },
);

const TASK_COLLECTION = 'tasks';

/**
 * The expense side of a task that belongs to one (spec 2026-09-02 §3.6). Two effects:
 *
 *  - on CREATE, latch `expense.taskKey`. The workflow engine creates the task now and knows
 *    nothing about expenses (and must not learn — `createTask` is generic), so without this the
 *    expense loses the link the OCR pipeline used to write, and `canOpenTask` goes false for
 *    every new expense.
 *  - on the transition into DONE, move the expense to 'validated'.
 *
 * Deliberately a dedicated trigger rather than a workflow action: no engine action patches an
 * arbitrary field on an arbitrary collection, and adding one would be an expression language by
 * the back door. `nextStatusForCompletedTask` holds the decision (and its 'posted' guard, which
 * fires on every approved booking) so it is unit-tested without the emulator.
 */
export const onExpenseTaskWritten = onDocumentWritten(
  { document: `${TASK_COLLECTION}/{taskId}`, region: REGION },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;   // deletes are not our business

    // `linkKey || relatedKey` mirrors task.form.ts:182 — the engine sets relatedKey and leaves
    // linkKey empty (see the Task 6 deviation), so matching only linkKey would find nothing.
    const linkKey = (after['linkKey'] as string) || (after['relatedKey'] as string) || '';
    if (!linkKey.startsWith('expense.')) return;
    const expenseKey = linkKey.slice('expense.'.length);
    if (!expenseKey) return;

    const db = getFirestore();
    const expenseRef = db.collection(EXPENSE_COLLECTION).doc(expenseKey);
    const snap = await expenseRef.get();
    if (!snap.exists) return;
    const expense = snap.data()!;

    // (1) latch the task onto the expense, once — a later task must not steal the link
    if (!before && !(expense['taskKey'] as string | undefined)) {
      await expenseRef.set({ taskKey: event.params['taskId'] }, { merge: true });
      logger.info(`onExpenseTaskWritten: latched task ${event.params['taskId']} onto ${expenseKey}`);
    }

    // (2) the transition INTO done, not every write to a task that is already done
    if (!before || before['state'] === 'done' || after['state'] !== 'done') return;

    const status = nextStatusForCompletedTask(linkKey, {
      status: expense['status'] as string | undefined,
      bookingKey: expense['bookingKey'] as string | undefined,
    });
    if (!status) return;

    await expenseRef.set({ status }, { merge: true });
    logger.info(`onExpenseTaskWritten: ${expenseKey} → ${status} (task ${event.params['taskId']})`);
  },
);
