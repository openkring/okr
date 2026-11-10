// apps/functions/src/credit/topup-paid.trigger.ts
//
// A billing invoice of the operator books turned paid (Stripe webhook or QR bill / bank import alike):
// - billingKind 'topup' → its amount is credited to the receiver tenant, once (entry `topup-<invoiceKey>`). See
//   topup.core.ts creditPaidTopUp for the guards.
// - billingKind 'subscription' → once none of the tenant's subscription invoices is open any more, pastDue /
//   closing return to active (billing/billing-daily.ts subscriptionInvoicePaid).
// Formerly `onTopUpPaid` (plan 1.149 Task 9); renamed in plan 2 Task 5 — a deploy must delete the old function.
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { InvoiceCollection } from '@okr/shared-models';

import { subscriptionInvoicePaid } from '../billing/billing-daily';
import { toStoreDate } from '../srv/zurich-time';
import { topUpTurnedPaid } from './auto-topup.logic';
import { creditPaidTopUp } from './topup.core';

type Doc = Record<string, unknown> | undefined;

const subscriptionTurnedPaid = (before: Doc, after: Doc): boolean =>
  after?.['billingKind'] === 'subscription' && after?.['state'] === 'paid' && before?.['state'] !== 'paid';

export const onBillingInvoicePaid = onDocumentUpdated(
  // retry: a transient failure (contention, a closed period being reopened) is tried again; the credit is idempotent
  // on its entry id and the state change on the subscription's state, so a retried or replayed event never acts twice.
  { document: `${InvoiceCollection}/{invoiceKey}`, region: 'europe-west6', retry: true },
  async event => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;
    const invoiceKey = event.params['invoiceKey'] as string;
    const log = (level: 'info' | 'warn' | 'error', message: string, data: Record<string, unknown>) => logger[level](message, data);
    if (topUpTurnedPaid(before, after)) {
      try {
        await creditPaidTopUp(getFirestore(), invoiceKey, after, log);
      } catch (err) {
        logger.error(`onBillingInvoicePaid: top-up invoice ${invoiceKey} not credited`, { invoiceKey, error: err instanceof Error ? err.message : String(err) });
        throw err; // rethrown so the event is retried
      }
      return;
    }
    if (subscriptionTurnedPaid(before, after)) {
      try {
        await subscriptionInvoicePaid(getFirestore(), invoiceKey, after, toStoreDate(new Date()), log);
      } catch (err) {
        logger.error(`onBillingInvoicePaid: subscription state after ${invoiceKey} not updated`, { invoiceKey, error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    }
  },
);
