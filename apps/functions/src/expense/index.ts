import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { getTodayStr, DateFormat } from '@okr/shared-util-core';

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
      userId: uid, accountingTenantId: d.tenantId,
      receiptCount,
    });
    logger.info(`createExpense: ${ref.id} for tenant ${d.tenantId} (receipts=${receiptCount})`);
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
