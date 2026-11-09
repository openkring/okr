// apps/functions/src/credit/topup-paid.trigger.ts
//
// A top-up invoice turned paid (Stripe webhook or QR bill / bank import alike) → its amount is credited to the
// receiver tenant, once (entry `topup-<invoiceKey>`). See topup.core.ts creditPaidTopUp for the guards.
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { InvoiceCollection } from '@okr/shared-models';

import { topUpTurnedPaid } from './auto-topup.logic';
import { creditPaidTopUp } from './topup.core';

export const onTopUpPaid = onDocumentUpdated(
  // retry: a transient failure (contention, a closed period being reopened) is tried again; the credit is idempotent
  // on its entry id, so a retried or replayed event never credits twice.
  { document: `${InvoiceCollection}/{invoiceKey}`, region: 'europe-west6', retry: true },
  async event => {
    const after = event.data?.after?.data();
    if (!after || !topUpTurnedPaid(event.data?.before?.data(), after)) return;
    const invoiceKey = event.params['invoiceKey'] as string;
    try {
      await creditPaidTopUp(getFirestore(), invoiceKey, after, (level, message, data) => logger[level](message, data));
    } catch (err) {
      logger.error(`onTopUpPaid: top-up invoice ${invoiceKey} not credited`, { invoiceKey, error: err instanceof Error ? err.message : String(err) });
      throw err; // rethrown so the event is retried
    }
  },
);
