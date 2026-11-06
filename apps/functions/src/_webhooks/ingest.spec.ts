import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { eventDocId, ingest } from './ingest';
import type { IngestDeps, StoredWebhookEvent, WebhookClient, WebhookRequest } from './types';

const SECRET = 'shh';
const NOW = 1_700_000_000_000;

function makeClient(over: Partial<WebhookClient> = {}): WebhookClient {
  return {
    id: 'fake',
    type: 'fake',
    auth: { kind: 'hmac-body', header: 'x-sig', secret: {} as never },
    tenant: { fixed: 'scs' },
    split: raw => {
      const v = JSON.parse(raw.toString());
      return Array.isArray(v) ? v : [v];
    },
    dedupeKey: e => String((e as { id: string }).id),
    maxBodyBytes: 100,
    retentionDays: 30,
    ...over,
  };
}

function makeReq(body: string, over: Partial<WebhookRequest> = {}, sign = true): WebhookRequest {
  const raw = Buffer.from(body);
  const sig = sign ? createHmac('sha256', SECRET).update(raw).digest('hex') : 'bad';
  return {
    method: 'POST',
    rawBody: raw,
    query: {},
    header: n => (n === 'x-sig' ? sig : undefined),
    ...over,
  };
}

function makeDeps(opts: { duplicates?: Set<string>; failIds?: Set<string> } = {}) {
  const rows = new Map<string, StoredWebhookEvent>();
  const attempts: string[] = [];
  const deps: IngestDeps = {
    writeEvent: async (id, event) => {
      attempts.push(id);
      if (opts.failIds?.has(id)) throw new Error('boom');
      if (opts.duplicates?.has(id) || rows.has(id)) return 'duplicate';
      rows.set(id, event);
      return 'created';
    },
    secretValue: () => SECRET,
    now: () => NOW,
  };
  return { deps, rows, attempts };
}

describe('eventDocId', () => {
  it('is the hex sha256 of clientId NUL dedupeKey', () => {
    expect(eventDocId('a', 'b')).toBe(createHash('sha256').update('a\0b').digest('hex'));
  });
});

describe('ingest', () => {
  it('answers 404 for an unknown client and writes nothing', async () => {
    const { deps, attempts } = makeDeps();
    expect((await ingest(undefined, makeReq('{"id":1}'), deps)).status).toBe(404);
    expect(attempts).toEqual([]);
  });
  it('answers 405 for GET', async () => {
    const { deps } = makeDeps();
    expect((await ingest(makeClient(), makeReq('{"id":1}', { method: 'GET' }), deps)).status).toBe(405);
  });
  it('answers 413 above maxBodyBytes', async () => {
    const { deps, attempts } = makeDeps();
    const big = JSON.stringify({ id: 1, pad: 'x'.repeat(200) });
    expect((await ingest(makeClient(), makeReq(big), deps)).status).toBe(413);
    expect(attempts).toEqual([]);
  });
  it('answers 401 for a bad signature and writes nothing', async () => {
    const { deps, attempts } = makeDeps();
    expect((await ingest(makeClient(), makeReq('{"id":1}', {}, false), deps)).status).toBe(401);
    expect(attempts).toEqual([]);
  });
  it('answers 400 when split throws and writes nothing', async () => {
    const { deps, attempts } = makeDeps();
    expect((await ingest(makeClient(), makeReq('not json'), deps)).status).toBe(400);
    expect(attempts).toEqual([]);
  });
  it('answers 200 for no events', async () => {
    const { deps, attempts } = makeDeps();
    expect((await ingest(makeClient(), makeReq('[]'), deps)).status).toBe(200);
    expect(attempts).toEqual([]);
  });
  it('stores one row per event with state received and the fixed tenant', async () => {
    const { deps, rows } = makeDeps();
    const res = await ingest(makeClient(), makeReq('[{"id":1},{"id":2}]'), deps);
    expect(res.status).toBe(200);
    expect(rows.size).toBe(2);
    const row = rows.get(eventDocId('fake', '1'))!;
    expect(row).toMatchObject({ clientId: 'fake', type: 'fake', tenants: ['scs'], state: 'received', payload: { id: 1 } });
    expect(row.receivedAt.toMillis()).toBe(NOW);
  });
  it('sets expiresAt to now + retentionDays', async () => {
    const { deps, rows } = makeDeps();
    await ingest(makeClient(), makeReq('{"id":1}'), deps);
    expect([...rows.values()][0].expiresAt.toMillis()).toBe(NOW + 30 * 86_400_000);
  });
  it('stores tenants [] for platform and record clients', async () => {
    for (const tenant of [{ scope: 'platform' }, { resolve: 'record' }] as const) {
      const { deps, rows } = makeDeps();
      await ingest(makeClient({ tenant }), makeReq('{"id":1}'), deps);
      expect([...rows.values()][0].tenants).toEqual([]);
    }
  });
  it('writes the missing rows of a retried batch and answers 200', async () => {
    const { deps, rows } = makeDeps({ duplicates: new Set([eventDocId('fake', '2')]) });
    const res = await ingest(makeClient(), makeReq('[{"id":1},{"id":2},{"id":3}]'), deps);
    expect(res.status).toBe(200);
    expect([...rows.keys()].sort()).toEqual([eventDocId('fake', '1'), eventDocId('fake', '3')].sort());
  });
  it('answers 500 when a write fails, after trying every event', async () => {
    const { deps, attempts } = makeDeps({ failIds: new Set([eventDocId('fake', '1')]) });
    const res = await ingest(makeClient(), makeReq('[{"id":1},{"id":2},{"id":3}]'), deps);
    expect(res.status).toBe(500);
    expect(attempts).toHaveLength(3);
  });
});
