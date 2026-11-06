export * from './mail-job';
export * from './group-mail';

import { onRequest } from 'firebase-functions/v2/https';
import { handleWebhook } from '../_webhooks/http';
import { mailtrapClient, mailtrapWebhookSecret } from './mailtrap-webhook';

/**
 * Webhook receiver for Mailtrap email events, on the shared receiver (_webhooks).
 * Kept at its own URL so the webhook configured in Mailtrap does not change.
 * Storage, TTL and event shapes: see mailtrap-webhook.ts.
 */
export const mailtrapWebhook = onRequest(
  { region: 'europe-west6', secrets: [mailtrapWebhookSecret] },
  handleWebhook(() => mailtrapClient)
);
