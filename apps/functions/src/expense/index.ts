import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

const REGION = 'europe-west6';
const CF_NAME = 'createExpense';
const EXPENSE_COLLECTION = 'expenses';
const USERS_COLLECTION = 'users';

interface CreateExpenseData {
  tenantId: string;
  accountingTenantId: string;
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
    const ref = db.collection(EXPENSE_COLLECTION).doc();
    await ref.set({
      tenants: [d.tenantId], isArchived: false, index: '', tags: '', notes: '',
      abstract: d.abstract ?? '',
      amountTotal: d.amountTotal, currency: d.currency || 'CHF',
      transferTo: d.transferTo ?? 'me', iban: d.iban ?? '',
      category: d.category ?? '', costCenterId: d.costCenterId ?? '', note: d.note ?? '',
      status: 'processing', bookingKey: '',
      userId: uid, accountingTenantId: d.accountingTenantId || d.tenantId,
      receiptCount: d.receiptCount ?? 0,
    });
    logger.info(`createExpense: ${ref.id} for tenant ${d.tenantId} (receipts=${d.receiptCount})`);
    return { expenseKey: ref.id };
  },
);
