import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { processWebhookEvent, type ProcessDeps, type WebhookHandler } from './process';
import type { StoredWebhookEvent } from './types';

function makeEvent(over: Partial<StoredWebhookEvent> = {}): StoredWebhookEvent {
  return {
    clientId: 'fake',
    type: 'fake',
    tenants: [],
    receivedAt: Timestamp.fromMillis(0),
    payload: {},
    state: 'received',
    expiresAt: Timestamp.fromMillis(1),
    ...over,
  };
}

function makeDeps(): ProcessDeps & { update: ReturnType<typeof vi.fn>; reportFailure: ReturnType<typeof vi.fn> } {
  return { update: vi.fn(async () => undefined), reportFailure: vi.fn(async () => undefined) };
}

describe('processWebhookEvent', () => {
  it('sets logged when the type has no handler', async () => {
    const deps = makeDeps();
    await processWebhookEvent(makeEvent(), 'e1', {}, deps);
    expect(deps.update).toHaveBeenCalledWith({ state: 'logged' });
  });
  it('sets the outcome state and tenants when the handler resolves one', async () => {
    const deps = makeDeps();
    const handler: WebhookHandler = async () => ({ state: 'handled', tenantId: 'scs' });
    await processWebhookEvent(makeEvent(), 'e1', { fake: handler }, deps);
    expect(deps.update).toHaveBeenCalledWith({ state: 'handled', tenants: ['scs'] });
  });
  it('sets the outcome state alone when the handler resolves no tenant', async () => {
    const deps = makeDeps();
    await processWebhookEvent(makeEvent(), 'e1', { fake: async () => ({ state: 'ignored' }) }, deps);
    expect(deps.update).toHaveBeenCalledWith({ state: 'ignored' });
  });
  it('sets failed with the error text and calls reportFailure, without rethrowing', async () => {
    const deps = makeDeps();
    const event = makeEvent();
    const handler: WebhookHandler = async () => {
      throw new Error('kaputt');
    };
    await expect(processWebhookEvent(event, 'e1', { fake: handler }, deps)).resolves.toBeUndefined();
    expect(deps.update).toHaveBeenCalledWith({ state: 'failed', error: 'kaputt' });
    expect(deps.reportFailure).toHaveBeenCalledWith(event, 'kaputt');
  });
  it('does nothing when the row is no longer received', async () => {
    const deps = makeDeps();
    const handler = vi.fn(async () => ({ state: 'handled' as const }));
    await processWebhookEvent(makeEvent({ state: 'handled' }), 'e1', { fake: handler }, deps);
    expect(handler).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });
});
