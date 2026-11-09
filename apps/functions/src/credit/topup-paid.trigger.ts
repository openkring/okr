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
  { document: `${InvoiceCollection}/{invoiceKey}`, region: 'europe-west6' },
  async event => {
    const after = event.data?.after?.data();
    if (!after || !topUpTurnedPaid(event.data?.before?.data(), after)) return;
    const invoiceKey = event.params['invoiceKey'] as string;
    // Thrown errors are logged by the runtime; the credit is idempotent, so a replay (e.g. a manual re-save) is safe.
    await creditPaidTopUp(getFirestore(), invoiceKey, after, (level, message, data) => logger[level](message, data));
  },
);
