// apps/functions/src/_webhooks/on-webhook-event.ts
//
// Processes each stored webhook row once (design §7). Signing secrets belong to the
// receiver function; this trigger binds only the API keys a handler calls out with
// (the Stripe handler reads fees and payment methods, plan 1.149 Task 7).
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { stripeSecretKey } from '../collection/stripe-port';
import { logWorkflowActivity } from '../workflow/activity';
import { WEBHOOK_HANDLERS } from './handlers';
import { processWebhookEvent } from './process';
import { WebhookEventCollection, type StoredWebhookEvent } from './types';

export const onWebhookEvent = onDocumentCreated(
  { document: `${WebhookEventCollection}/{id}`, region: 'europe-west6', secrets: [stripeSecretKey] },
  async event => {
    const snap = event.data;
    if (!snap) return;
    const row = snap.data() as StoredWebhookEvent;

    await processWebhookEvent(row, snap.id, WEBHOOK_HANDLERS, {
      readState: async () => ((await snap.ref.get()).data() as StoredWebhookEvent | undefined)?.state,
      update: patch => snap.ref.update(patch).then(() => undefined),
      reportFailure: async (failed, message) => {
        logger.error('webhooks: event failed', { clientId: failed.clientId, type: failed.type, error: message });
        const tenant = failed.tenants[0];
        if (tenant) await logWorkflowActivity(tenant, { rule: `webhook:${failed.clientId}`, kind: failed.type, error: message });
      },
    });
  },
);
