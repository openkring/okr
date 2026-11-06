// apps/functions/src/_webhooks/handlers.ts
//
// Handlers by client `type`. A type without a handler is stored and marked `logged`.
import type { WebhookHandler } from './process';

export const WEBHOOK_HANDLERS: Record<string, WebhookHandler> = {};
