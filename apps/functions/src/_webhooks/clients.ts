// apps/functions/src/_webhooks/clients.ts
//
// The registry of inbound webhook senders. One entry per sender, added by the task
// that owns the provider. The URL segment is the client's `id`.
import type { WebhookClient } from './types';
import { mailtrapClient } from '../email/mailtrap-webhook';
import { deepSignClient } from '../esign/deepsign-webhook';

export const WEBHOOK_CLIENTS: WebhookClient[] = [mailtrapClient, deepSignClient];

export function findClient(id: string): WebhookClient | undefined {
  return WEBHOOK_CLIENTS.find(c => c.id === id);
}

/** Every client's secret, once: Gen-2 binds secrets to the function that reads them. */
export const WEBHOOK_SECRETS = [...new Set(WEBHOOK_CLIENTS.map(c => c.auth.secret))];
