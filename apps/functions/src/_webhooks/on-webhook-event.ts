// apps/functions/src/_webhooks/on-webhook-event.ts
//
// Processes each stored webhook row once (design §7). Binds no secrets: handlers
// work on stored data, and secrets belong to the receiver function.
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { logWorkflowActivity } from '../workflow/activity';
import { WEBHOOK_HANDLERS } from './handlers';
import { processWebhookEvent } from './process';
import { WebhookEventCollection, type StoredWebhookEvent } from './types';

export const onWebhookEvent = onDocumentCreated(
  { document: `${WebhookEventCollection}/{id}`, region: 'europe-west6' },
  async event => {
    const snap = event.data;
    if (!snap) return;
    const row = snap.data() as StoredWebhookEvent;

    await processWebhookEvent(row, snap.id, WEBHOOK_HANDLERS, {
      update: patch => snap.ref.update(patch).then(() => undefined),
      reportFailure: async (failed, message) => {
        logger.error('webhooks: event failed', { clientId: failed.clientId, type: failed.type, error: message });
        const tenant = failed.tenants[0];
        if (tenant) await logWorkflowActivity(tenant, { rule: `webhook:${failed.clientId}`, kind: failed.type, error: message });
      },
    });
  },
);
