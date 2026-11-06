// apps/functions/src/_webhooks/process.ts
//
// What onWebhookEvent does with one stored row (design §7). Pure of Firestore: the
// caller injects the row update and the failure report. Never rethrows, so a failing
// handler does not make the trigger retry and mail the same event again.
import type { StoredWebhookEvent, WebhookEventState } from './types';

export type WebhookOutcome = { state: 'handled' | 'ignored'; tenantId?: string };
export type WebhookHandler = (event: StoredWebhookEvent, eventId: string) => Promise<WebhookOutcome>;

export interface ProcessDeps {
  /** The row's live state (a fresh read), or undefined when the row is gone. */
  readState(): Promise<WebhookEventState | undefined>;
  update(patch: Partial<StoredWebhookEvent>): Promise<void>;
  reportFailure(event: StoredWebhookEvent, message: string): Promise<void>;
}

export async function processWebhookEvent(
  event: StoredWebhookEvent,
  eventId: string,
  handlers: Record<string, WebhookHandler>,
  deps: ProcessDeps,
): Promise<void> {
  // The trigger is at-least-once, and its snapshot is the document as created, so it always
  // says 'received'. Only a fresh read shows that an earlier delivery already settled the row.
  // Two truly concurrent deliveries can both pass this check and both run the handler; that
  // is acceptable because handlers are idempotent.
  if ((await deps.readState()) !== 'received') return;

  const handler = handlers[event.type];
  if (!handler) {
    await deps.update({ state: 'logged' });
    return;
  }

  let outcome: WebhookOutcome;
  try {
    outcome = await handler(event, eventId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.update({ state: 'failed', error: message });
    await deps.reportFailure(event, message);
    return;
  }
  // Outside the try: the handler succeeded, so a failing write here must not mark the row
  // failed. It rejects instead; the row stays 'received' and the trigger error is logged by
  // Cloud Functions (no retry is configured, so the handler is not run again by itself).
  await deps.update({ state: outcome.state, ...(outcome.tenantId ? { tenants: [outcome.tenantId] } : {}) });
}
