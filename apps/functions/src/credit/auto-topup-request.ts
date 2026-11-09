// apps/functions/src/credit/auto-topup-request.ts
//
// The auto top-up request doc, credit-accounts/{tenantId}/auto-top-up/request (AutoTopUpRequest). Its own file so
// the Stripe webhook can clear it without importing the top-up core (which imports the webhook's settle path).
import type { Firestore } from 'firebase-admin/firestore';

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
