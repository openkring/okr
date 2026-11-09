import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({}), defineString: () => ({}) }));

import type { StoredWebhookEvent } from '../_webhooks/types';
import type { SendingRow } from './submit-sending.logic';
import { makePingenHandler, pingenClient, pingenDedupeKey, splitPingenEvent, type PingenWebhookDeps } from './pingen-webhook';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const FIX: Record<string, Json> = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'pingen-webhooks.json'), 'utf8'));
const LETTER = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-09T10:00:00.000Z');
const OPTIONS = { deliveryProduct: 'cheap', printSpectrum: 'grayscale', printMode: 'simplex' } as const;

const row = (over: Partial<SendingRow> = {}): SendingRow => ({
  id: 's1', tenants: ['scs'], isArchived: false, channel: 'post', source: 'mailing.m1', recipientKey: 'p1', recipientName: 'Test Person',
  storagePath: 'x.pdf', options: OPTIONS, pages: 2, price: 180, provider: 'pingen', providerId: LETTER, state: 'submitted',
  history: [{ state: 'submitted', at: 'x' }], trackingNumber: '', createdAt: 'x', updatedAt: 'x', ...over,
});

function setup(rows: SendingRow[]) {
  const store = new Map(rows.map((r) => [r.id, r]));
  const tasks: Array<{ name: string; relatedKey: string; tenantId: string; linkKey?: string }> = [];
  const reverseShare = vi.fn(async () => ({ amount: 150, duplicate: false }));
  const deps: PingenWebhookDeps = {
    findByProviderId: async (id) => [...store.values()].find((r) => r.providerId === id),
    getSending: async (id) => store.get(id),
    updateSending: async (id, patch, expect) => {
      const cur = store.get(id);
      if (!cur || (expect && cur.state !== expect)) return false;
      store.set(id, { ...cur, ...patch } as SendingRow);
      return true;
    },
    loadMailing: async () => ({ senderKey: 'pe1', senderName: 'Sandra Sender', subject: 'Einladung', creditEntryId: 'e1', pagesPerLetter: 2 }),
    avatar: async (key, _t, name) => ({ key, name1: name, name2: '', modelType: 'person', type: '', subType: '', label: '' }),
    hasOpenTask: async (relatedKey) => tasks.some((t) => t.relatedKey === relatedKey),
    createTask: async (t) => { tasks.push(t as never); },
    reverseShare,
    now: () => NOW,
  };
  return { deps, store, tasks, reverseShare, handler: makePingenHandler(deps) };
}

const stored = (payload: unknown): StoredWebhookEvent => ({ clientId: 'pingen', type: 'pingen', tenants: [], payload } as unknown as StoredWebhookEvent);
const withLetter = (fixture: Json, letterId: string): Json => JSON.parse(JSON.stringify(fixture).replace(LETTER, letterId));
const withStatus = (fixture: Json, status: string): Json => { const c = JSON.parse(JSON.stringify(fixture)); c.data.attributes.status = status; return c; };

describe('pingen client', () => {
  it('declares the hmac-body Signature header, record tenant, 100 kB, 30 days', () => {
    expect(pingenClient.id).toBe('pingen');
    expect(pingenClient.type).toBe('pingen');
    expect(pingenClient.auth).toMatchObject({ kind: 'hmac-body', header: 'Signature' });
    expect(pingenClient.tenant).toEqual({ resolve: 'record' });
    expect(pingenClient.maxBodyBytes).toBe(100_000);
    expect(pingenClient.retentionDays).toBe(30);
  });
  it('split returns one event', () => {
    expect(splitPingenEvent(Buffer.from(JSON.stringify(FIX['sent'])))).toEqual([FIX['sent']]);
    expect(() => splitPingenEvent(Buffer.from('nope'))).toThrow();
  });
  it('dedupeKey is relationships.event.data.id, fallback a hash of the body', () => {
    expect(pingenDedupeKey(FIX['sent'])).toBe('e0000000-0000-4000-8000-000000000001');
    const noEvent = { data: { type: 'webhook_sent', relationships: {} } };
    expect(pingenDedupeKey(noEvent)).toMatch(/^h:[0-9a-f]{64}$/);
    expect(pingenDedupeKey(noEvent)).toBe(pingenDedupeKey({ ...noEvent }));
  });
});

describe('pingenHandler', () => {
  it('sent moves submitted to sent and appends history', async () => {
    const { handler, store } = setup([row()]);
    expect(await handler(stored(FIX['sent']), 'w1')).toEqual({ state: 'handled', tenantId: 'scs' });
    const r = store.get('s1')!;
    expect(r.state).toBe('sent');
    expect(r.history.at(-1)).toMatchObject({ state: 'sent', at: NOW.toISOString() });
    expect(r.history.at(-1)?.detail).toContain('e0000000-0000-4000-8000-000000000001');
  });

  it('sent also moves submitting to sent (our success write was lost)', async () => {
    const { handler, store } = setup([row({ state: 'submitting' })]);
    await handler(stored(FIX['sent']), 'w1');
    expect(store.get('s1')?.state).toBe('sent');
  });

  it('delivered moves sent to delivered; the payload has no tracking number, so none is invented', async () => {
    const { handler, store } = setup([row({ state: 'sent' })]);
    await handler(stored(FIX['delivered']), 'w1');
    expect(store.get('s1')).toMatchObject({ state: 'delivered', trackingNumber: '' });
  });

  it('delivered stores a trackingNumber when the payload carries one', async () => {
    const { handler, store } = setup([row({ state: 'sent' })]);
    const p = JSON.parse(JSON.stringify(FIX['delivered']));
    p.data.attributes.tracking_number = '99.00.123456';
    await handler(stored(p), 'w1');
    expect(store.get('s1')).toMatchObject({ state: 'delivered', trackingNumber: '99.00.123456' });
  });

  it('undeliverable creates one «Adresse von … prüfen» task and does not reverse', async () => {
    const { handler, store, tasks, reverseShare } = setup([row({ state: 'sent' })]);
    await handler(stored(FIX['undeliverable']), 'w1');
    expect(store.get('s1')?.state).toBe('undeliverable');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ name: 'Adresse von Test Person prüfen', relatedKey: 'sending.s1.undeliverable', linkKey: 'mailing.m1', tenantId: 'scs' });
    expect(reverseShare).not.toHaveBeenCalled();
    // never the corrected address in the history
    expect(JSON.stringify(store.get('s1')?.history)).not.toContain('Teststrasse');
  });

  it('undeliverable from submitted passes through sent (the sent event was lost)', async () => {
    const { handler, store, tasks } = setup([row()]);
    await handler(stored(FIX['undeliverable']), 'w1');
    const r = store.get('s1')!;
    expect(r.state).toBe('undeliverable');
    expect(r.history.map((h) => h.state)).toEqual(['submitted', 'sent', 'undeliverable']);
    expect(tasks).toHaveLength(1);
  });

  it('a second undeliverable event does not create a second task', async () => {
    const { handler, tasks } = setup([row({ state: 'sent' })]);
    await handler(stored(FIX['undeliverable']), 'w1');
    const again = withLetter(FIX['undeliverable'], LETTER);
    again.data.relationships.event.data.id = 'e0000000-0000-4000-8000-0000000000ff';
    await handler(stored(again), 'w2');
    expect(tasks).toHaveLength(1);
  });

  it('an open task of that key suppresses a new one', async () => {
    const { handler, deps, tasks } = setup([row({ state: 'sent' })]);
    deps.hasOpenTask = async () => true;
    await handler(stored(FIX['undeliverable']), 'w1');
    expect(tasks).toHaveLength(0);
  });

  it('issues with a rejection fails the letter via failSending(reverse: true)', async () => {
    const { handler, store, tasks, reverseShare } = setup([row()]);
    expect(await handler(stored(withStatus(FIX['issues'], 'unprintable')), 'w1')).toEqual({ state: 'handled', tenantId: 'scs' });
    const r = store.get('s1')!;
    expect(r.state).toBe('failed');
    expect(r.failReason).toBe('other');
    expect(reverseShare).toHaveBeenCalledTimes(1);
    expect(reverseShare.mock.calls[0]).toEqual(['scs', 'e1', { units: 1, pages: 2 }, 's1', expect.any(String)]);
    expect(tasks).toHaveLength(1);
  });

  it('a rejection naming the address is failReason address', async () => {
    const { handler, store } = setup([row()]);
    const p = withStatus(FIX['issues'], 'invalid');
    p.data.attributes.reason = 'Address could not be read';
    await handler(stored(p), 'w1');
    expect(store.get('s1')?.failReason).toBe('address');
  });

  it('issues without a rejection (action_required, or no status in the payload) only appends history', async () => {
    for (const payload of [FIX['issues'], withStatus(FIX['issues'], 'action_required')]) {
      const { handler, store, tasks, reverseShare } = setup([row()]);
      expect(await handler(stored(payload), 'w1')).toEqual({ state: 'handled', tenantId: 'scs' });
      const r = store.get('s1')!;
      expect(r.state).toBe('submitted');
      expect(r.history).toHaveLength(2);
      expect(r.history.at(-1)?.detail).toContain('Content failed inspection');
      expect(tasks).toHaveLength(1); // one task for the sender, see the next test
      expect(reverseShare).not.toHaveBeenCalled();
    }
  });

  it('a non-rejecting issues event opens ONE task «Pingen meldet ein Problem …» (reason max 120 chars), deduped on sending.<id>.issue', async () => {
    const { handler, store, tasks, reverseShare } = setup([row()]);
    const p = JSON.parse(JSON.stringify(FIX['issues']));
    p.data.attributes.reason = 'x'.repeat(300);
    await handler(stored(p), 'w1');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ relatedKey: 'sending.s1.issue', linkKey: 'mailing.m1', tenantId: 'scs' });
    expect(tasks[0].name).toBe(`Pingen meldet ein Problem mit dem Brief an Test Person: ${'x'.repeat(120)}`);
    const again = JSON.parse(JSON.stringify(FIX['issues']));
    again.data.relationships.event.data.id = 'e0000000-0000-4000-8000-0000000000fe';
    await handler(stored(again), 'w2');
    expect(tasks).toHaveLength(1);
    expect(store.get('s1')?.state).toBe('submitted');
    expect(reverseShare).not.toHaveBeenCalled();
  });

  it('the dedupe marker and the failure are ONE write; a retry after a crash before failSending still fails the letter', async () => {
    const { handler, store, deps, reverseShare } = setup([row()]);
    const real = deps.updateSending;
    let crash = true;
    deps.updateSending = async (id, patch, expect) => {
      if (crash) { crash = false; throw new Error('crash'); }
      return real(id, patch, expect);
    };
    const rejected = withStatus(FIX['issues'], 'unprintable');
    await expect(handler(stored(rejected), 'w1')).rejects.toThrow('crash');
    expect(store.get('s1')?.history).toHaveLength(1); // no marker without the failure
    await handler(stored(rejected), 'w1');
    const r = store.get('s1')!;
    expect(r.state).toBe('failed');
    expect(r.history.filter((h) => (h.detail ?? '').includes('e0000000-0000-4000-8000-000000000004'))).toHaveLength(1);
    expect(reverseShare).toHaveBeenCalledTimes(1);
  });

  it('a matched record without tenants is ignored', async () => {
    const { handler, store } = setup([row({ tenants: [] })]);
    expect(await handler(stored(FIX['sent']), 'w1')).toEqual({ state: 'ignored' });
    expect(store.get('s1')?.state).toBe('submitted');
  });

  it('a late rejection after sent is history only', async () => {
    const { handler, store, reverseShare } = setup([row({ state: 'sent' })]);
    await handler(stored(withStatus(FIX['issues'], 'unprintable')), 'w1');
    expect(store.get('s1')?.state).toBe('sent');
    expect(reverseShare).not.toHaveBeenCalled();
  });

  it('never moves backwards: sent after delivered changes nothing but history', async () => {
    const { handler, store } = setup([row({ state: 'delivered' })]);
    await handler(stored(FIX['sent']), 'w1');
    expect(store.get('s1')?.state).toBe('delivered');
    expect(store.get('s1')?.history).toHaveLength(2);
  });

  it('a duplicate event (same event id already in history) is a no-op', async () => {
    const { handler, store, deps } = setup([row()]);
    await handler(stored(FIX['sent']), 'w1');
    const update = vi.spyOn(deps, 'updateSending');
    const before = store.get('s1');
    expect(await handler(stored(FIX['sent']), 'w2')).toEqual({ state: 'handled', tenantId: 'scs' });
    expect(update).not.toHaveBeenCalled();
    expect(store.get('s1')).toEqual(before);
  });

  it('retries when the state moved between the read and the guarded write', async () => {
    const { handler, store, deps } = setup([row({ state: 'submitting' })]);
    const real = deps.updateSending;
    let first = true;
    deps.updateSending = async (id, patch, expect) => {
      if (first) { first = false; store.set(id, { ...store.get(id)!, state: 'submitted' }); }
      return real(id, patch, expect);
    };
    await handler(stored(FIX['sent']), 'w1');
    expect(store.get('s1')?.state).toBe('sent');
  });

  it('an unknown letter is ignored without throwing', async () => {
    const { handler, store } = setup([row()]);
    expect(await handler(stored(withLetter(FIX['sent'], 'ffffffff-ffff-4fff-8fff-ffffffffffff')), 'w1')).toEqual({ state: 'ignored' });
    expect(store.get('s1')?.state).toBe('submitted');
  });

  it('ignores a deliverable that is not a letter, and an event without a letter id', async () => {
    const { handler } = setup([row()]);
    const email = JSON.parse(JSON.stringify(FIX['sent']));
    email.data.relationships.deliverable.data.type = 'emails';
    expect(await handler(stored(email), 'w1')).toEqual({ state: 'ignored' });
    expect(await handler(stored({ data: { type: 'webhook_sent', relationships: {} } }), 'w2')).toEqual({ state: 'ignored' });
    expect(await handler(stored('garbage'), 'w3')).toEqual({ state: 'ignored' });
  });

  it('an unknown event type is ignored', async () => {
    const { handler } = setup([row()]);
    const p = JSON.parse(JSON.stringify(FIX['sent']));
    p.data.type = 'webhook_channel_subscriptions';
    expect(await handler(stored(p), 'w1')).toEqual({ state: 'ignored' });
  });

  it('tenantId comes from the record', async () => {
    const { handler } = setup([row({ tenants: ['kring', 'scs'] })]);
    expect(await handler(stored(FIX['sent']), 'w1')).toEqual({ state: 'handled', tenantId: 'kring' });
  });
});
