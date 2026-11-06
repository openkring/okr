// apps/functions/src/_webhooks/process.ts
//
// What onWebhookEvent does with one stored row (design §7). Pure of Firestore: the
// caller injects the row update and the failure report. Never rethrows, so a failing
// handler does not make the trigger retry and mail the same event again.
import type { StoredWebhookEvent } from './types';

export type WebhookOutcome = { state: 'handled' | 'ignored'; tenantId?: string };
export type WebhookHandler = (event: StoredWebhookEvent, eventId: string) => Promise<WebhookOutcome>;

export interface ProcessDeps {
  update(patch: Partial<StoredWebhookEvent>): Promise<void>;
  reportFailure(event: StoredWebhookEvent, message: string): Promise<void>;
}

export async function processWebhookEvent(
  event: StoredWebhookEvent,
  eventId: string,
  handlers: Record<string, WebhookHandler>,
  deps: ProcessDeps,
): Promise<void> {
  // The trigger is at-least-once: a second delivery finds the row already settled.
  if (event.state !== 'received') return;

  const handler = handlers[event.type];
  if (!handler) {
    await deps.update({ state: 'logged' });
    return;
  }

  try {
    const outcome = await handler(event, eventId);
    await deps.update({ state: outcome.state, ...(outcome.tenantId ? { tenants: [outcome.tenantId] } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.update({ state: 'failed', error: message });
    await deps.reportFailure(event, message);
  }
}
