// apps/functions/src/_webhooks/handlers.ts
//
// Handlers by client `type`. A type without a handler is stored and marked `logged`.
import type { WebhookHandler } from './process';
import { stripeHandler } from '../collection/stripe-webhook';
import { mailtrapHandler } from '../email/mailtrap-webhook';
import { deepSignHandler } from '../esign/deepsign-webhook';
import { pingenHandler } from '../pingen/pingen-webhook';
import { selftestHandler } from './selftest-client';

export const WEBHOOK_HANDLERS: Record<string, WebhookHandler> = {
  mailtrap: mailtrapHandler,
  deepsign: deepSignHandler,
  stripe: stripeHandler,
  pingen: pingenHandler,
  selftest: selftestHandler,
};
