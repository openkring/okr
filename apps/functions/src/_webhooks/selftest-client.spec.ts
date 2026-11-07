import { describe, it, expect } from 'vitest';
import { selftestClient, selftestHandler, selftestSecret } from './selftest-client';
import { WEBHOOK_SECRETS, findClient } from './clients';
import { WEBHOOK_HANDLERS } from './handlers';
import type { StoredWebhookEvent } from './types';

describe('selftestClient', () => {
  const raw = Buffer.from(JSON.stringify({ runId: 'r1', sentAt: '2026-11-07T03:15:00Z' }));

  it('splits one event and dedupes on runId', () => {
    const events = selftestClient.split(raw, {} as never);
    expect(events).toHaveLength(1);
    expect(selftestClient.dedupeKey(events[0], {} as never)).toBe('r1');
  });

  it('is registered with its secret and handler', () => {
    expect(findClient('selftest')).toBe(selftestClient);
    expect(WEBHOOK_SECRETS).toContain(selftestSecret);
    expect(WEBHOOK_HANDLERS['selftest']).toBe(selftestHandler);
  });

  it('handler marks the row handled and has no side effect', async () => {
    const outcome = await selftestHandler({ payload: { runId: 'r1' } } as StoredWebhookEvent, 'id');
    expect(outcome).toEqual({ state: 'handled' });
  });
});
