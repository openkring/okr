import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { PaymentCollection, PaymentOrderCollection } from '@okr/shared-models';
import { approveBlocker } from '@okr/finance-payment-util';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

const CF = 'approvePaymentOrder';

/**
 * The only way a payment order becomes `approved` (spec 1.80 §5.4) — the rules forbid it from the
 * client. Enforces the four-eyes principle server-side via approveBlocker. The approver key is the
 * caller's users/{uid} okey, which is what PaymentStore writes into createdBy.
 */
export const approvePaymentOrder = onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request: CallableRequest<{ paymentOrderKey: string }>): Promise<{ ok: true }> => {
    checkAppCheckToken(request, CF);
    checkAuthentication(request, CF);
    await checkRoles(request, CF, ['treasurer']);
    const tenantId = await getCallerTenantId(request, CF);
    const key = request.data?.paymentOrderKey;
    if (!key) throw new HttpsError('invalid-argument', 'paymentOrderKey required');

    const db = admin.firestore();
    const orderRef = db.collection(PaymentOrderCollection).doc(key);
    const approverKey = request.auth!.uid;
    await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      const order = orderSnap.data();
      if (!order || !((order['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw new HttpsError('not-found', `Payment order ${key} not found`);
      }
      const payments = await tx.get(db.collection(PaymentCollection)
        .where('paymentOrderKey', '==', key).where('tenants', 'array-contains', tenantId));
      const blocker = approveBlocker(order, payments.docs.map(d => d.data()), approverKey);
      if (blocker) throw new HttpsError('failed-precondition', blocker);
      tx.update(orderRef, { status: 'approved', approvedBy: approverKey });
      payments.docs.forEach(d => tx.update(d.ref, { status: 'approved' }));
    });
    logger.info(`${CF}: order ${key} approved by ${approverKey} (tenant=${tenantId})`);
    return { ok: true };
  },
);
