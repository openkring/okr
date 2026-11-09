// apps/functions/src/credit/auto-topup.trigger.ts
//
// Auto top-up off the send path (Ruling R9): deductCredit only stamps credit-accounts/{tenantId}.autoTopUpRequestedAt;
// this trigger sees the new request, issues the top-up invoice (a PDF render: issueInvoice's runtime options) and
// charges the saved payment method off-session. See topup.core.ts runAutoTopUp.
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { CreditAccountCollection } from '@okr/shared-models';

import { stripePort, stripeSecretKey } from '../collection/stripe-port';
import { newAutoTopUpRequest } from './auto-topup.logic';
import { clearAutoTopUp, runAutoTopUp } from './topup.core';

export const onAutoTopUpRequested = onDocumentUpdated(
  {
    document: `${CreditAccountCollection}/{tenantId}`, region: 'europe-west6', secrets: [stripeSecretKey],
    memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10,
  },
  async event => {
    const requestedAt = newAutoTopUpRequest(event.data?.before?.data(), event.data?.after?.data());
    if (!requestedAt) return;
    const tenantId = event.params['tenantId'] as string;
    const db = getFirestore();
    try {
      await runAutoTopUp(db, stripePort(), tenantId, requestedAt, (level, message, data) => logger[level](message, data));
    } catch (err) {
      // Clear the request so the next deduction can ask again; the invoice key is per request, a retry issues anew.
      logger.error(`onAutoTopUpRequested: auto top-up for ${tenantId} failed`, { requestedAt, error: err instanceof Error ? err.message : String(err) });
      await clearAutoTopUp(db, tenantId);
    }
  },
);
