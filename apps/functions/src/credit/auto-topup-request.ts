// apps/functions/src/credit/auto-topup-request.ts
//
// The auto top-up request doc, credit-accounts/{tenantId}/auto-top-up/request (AutoTopUpRequest). Its own file so
// the Stripe webhook can clear it without importing the top-up core (which imports the webhook's settle path).
import type { Firestore } from 'firebase-admin/firestore';
import { SubscriptionCollection } from '@okr/shared-models';
import type { AutoTopUp } from '@okr/shared-models';

import { AUTO_TOPUP_REQUEST_ID, autoTopUpCollectionPath } from './auto-topup.logic';

export const autoTopUpRequestRef = (db: Firestore, tenantId: string) => db.collection(autoTopUpCollectionPath(tenantId)).doc(AUTO_TOPUP_REQUEST_ID);

/** Clears the auto top-up request; with `invoiceKey`, only while that invoice is the pending one. */
export async function clearAutoTopUp(db: Firestore, tenantId: string, invoiceKey?: string): Promise<void> {
  const ref = autoTopUpRequestRef(db, tenantId);
  await db.runTransaction(async tx => {
    const request = (await tx.get(ref)).data();
    if (!request) return;
    if (invoiceKey !== undefined && String(request['pendingInvoiceKey'] ?? '') !== invoiceKey) return;
    tx.set(ref, { requestedAt: '', pendingInvoiceKey: '', retryCount: 0 });
  });
}

/**
 * Switches auto top-up off on subscriptions/{tenantId} (after a declined charge). Idempotent: an absent
 * subscription or one already off is left as it is. Both the auto top-up run and the payment-failed webhook call it,
 * so a late or failed webhook never lets the next deduction charge the declining card again.
 */
export async function switchOffAutoTopUp(db: Firestore, tenantId: string): Promise<void> {
  const subRef = db.collection(SubscriptionCollection).doc(tenantId);
  const sub = (await subRef.get()).data();
  if (!sub) return;
  const autoTopUp = (sub['autoTopUp'] ?? { enabled: false, threshold: 0, amount: 0 }) as AutoTopUp;
  if (autoTopUp.enabled) await subRef.update({ autoTopUp: { ...autoTopUp, enabled: false } });
}
