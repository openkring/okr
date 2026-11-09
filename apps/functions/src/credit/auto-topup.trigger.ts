// apps/functions/src/credit/auto-topup.trigger.ts
//
// Auto top-up off the send path (Ruling R9): deductCredit only stamps credit-accounts/{tenantId}/auto-top-up/request
// (requestedAt) in its transaction; this trigger sees the new request, issues the top-up invoice (a PDF render:
// issueInvoice's runtime options) and charges the saved payment method off-session. It listens on the small request
// doc, not on the credit account, so a balance change never starts a 1 GiB instance. See topup.core.ts runAutoTopUp,
// which also decides what an error clears (only errors before the charge call).
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { CreditAccountCollection, CreditAutoTopUpRequestDocId, CreditAutoTopUpSubcollection } from '@okr/shared-models';

import { stripePort, stripeSecretKey } from '../collection/stripe-port';
import { newAutoTopUpRequest } from './auto-topup.logic';
import { runAutoTopUp } from './topup.core';

export const onAutoTopUpRequested = onDocumentWritten(
  {
    document: `${CreditAccountCollection}/{tenantId}/${CreditAutoTopUpSubcollection}/${CreditAutoTopUpRequestDocId}`,
    region: 'europe-west6', secrets: [stripeSecretKey],
    memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10,
  },
  async event => {
    const after = event.data?.after?.data();
    const requestedAt = newAutoTopUpRequest(event.data?.before?.data(), after);
    if (!requestedAt) return;
    const tenantId = event.params['tenantId'] as string;
    try {
      await runAutoTopUp(getFirestore(), stripePort(), tenantId, {
        requestedAt, pendingInvoiceKey: String(after?.['pendingInvoiceKey'] ?? ''),
      }, (level, message, data) => logger[level](message, data));
    } catch (err) {
      logger.error(`onAutoTopUpRequested: auto top-up for ${tenantId} failed`, { requestedAt, error: err instanceof Error ? err.message : String(err) });
    }
  },
);
