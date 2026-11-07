import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import type { StoredWebhookEvent, WebhookRequest } from '../_webhooks/types';
import { findClient } from '../_webhooks/clients';
import { computeWebhookToken, verifyWebhookToken, newDocumentWebhookToken, webhookSecret, webhookTokenSecret } from './shared';
import { deepSignClient, deepSignLegacyClient, refusedByCutoff, legacyGate, ESIGN_LEGACY_CUTOFF_ISO, deepSignDedupeKey, deepSignUpdate, makeDeepSignHandler, splitDeepSignEvent, type DeepSignPayload } from './deepsign-webhook';

const now = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
const pending = (id: string) => ({ signeeId: id, signStatus: 'pending' });
const payload = (p: Partial<DeepSignPayload>): DeepSignPayload => ({ esignId: 'e1', ...p });

describe('deepSignUpdate', () => {
  it('marks the matching signee signed on signee-completed', () => {
    const record = { documentStatus: 'pending', signees: [pending('a'), pending('b')] };
    const u = deepSignUpdate(record, payload({ eventType: 'signee-completed', signeeId: 'a', timestamp: '2026-02-03T04:05:06Z' }), now)!;
    const t = Timestamp.fromDate(new Date('2026-02-03T04:05:06Z'));
    expect(u['signees']).toEqual([{ signeeId: 'a', signStatus: 'signed', signedTime: t, completionTime: t }, pending('b')]);
    expect(u['events']).toBeDefined();
    expect(u['updatedAt']).toBeDefined();
    expect(u['documentStatus']).toBeUndefined();
  });

  it('sets documentStatus, signStatus and completionTime on document-completed', () => {
    const u = deepSignUpdate({ documentStatus: 'pending' }, payload({ eventType: 'document-completed' }), now)!;
    expect(u['documentStatus']).toBe('signed');
    expect(u['signStatus']).toBe('signed');
    expect(u['completionTime']).toEqual(now);
    expect(u['events']).toBeDefined();
  });

  it('marks a late signee on a signed record without touching documentStatus', () => {
    const record = { documentStatus: 'signed', signees: [pending('a')] };
    const u = deepSignUpdate(record, payload({ eventType: 'signee-completed', signeeId: 'a' }), now)!;
    expect((u['signees'] as Array<Record<string, unknown>>)[0]['signStatus']).toBe('signed');
    expect(u['events']).toBeDefined();
    expect(u).not.toHaveProperty('documentStatus');
    expect(u).not.toHaveProperty('signStatus');
    expect(u).not.toHaveProperty('completionTime');
  });

  it('returns null for a signee event on a rejected record', () => {
    const record = { documentStatus: 'rejected', signees: [pending('a')] };
    expect(deepSignUpdate(record, payload({ eventType: 'signee-completed', signeeId: 'a' }), now)).toBeNull();
  });

  it('returns null for document-completed on a terminal record', () => {
    for (const documentStatus of ['signed', 'rejected', 'withdrawn']) {
      expect(deepSignUpdate({ documentStatus }, payload({ eventType: 'document-completed' }), now)).toBeNull();
    }
  });

  it('returns null for an unknown eventType', () => {
    expect(deepSignUpdate({ documentStatus: 'pending' }, payload({ eventType: 'something-else' }), now)).toBeNull();
  });

  it('returns null for a signee already signed', () => {
    const record = { documentStatus: 'pending', signees: [{ signeeId: 'a', signStatus: 'signed' }] };
    expect(deepSignUpdate(record, payload({ eventType: 'signee-completed', signeeId: 'a' }), now)).toBeNull();
  });

  it('records an audit event for an unknown signee on a live record, leaving signees alone', () => {
    const record = { documentStatus: 'pending', signees: [pending('a')] };
    const u = deepSignUpdate(record, payload({ eventType: 'signee-completed', signeeId: 'zz' }), now)!;
    expect(u['events']).toBeDefined();
    expect(u['updatedAt']).toBeDefined();
    expect(u).not.toHaveProperty('signees');
  });

  it('returns null for an unknown signee on a terminal record', () => {
    for (const documentStatus of ['signed', 'rejected', 'withdrawn']) {
      const record = { documentStatus, signees: [pending('a')] };
      expect(deepSignUpdate(record, payload({ eventType: 'signee-completed', signeeId: 'zz' }), now)).toBeNull();
    }
  });

  it('uses now for a timestamp outside the Firestore range', () => {
    const u = deepSignUpdate({ documentStatus: 'pending' }, payload({ eventType: 'document-completed', timestamp: '+010000-01-01T00:00:00Z' }), now)!;
    expect(u['completionTime']).toEqual(now);
  });

  it('uses now for an unparseable timestamp', () => {
    const u = deepSignUpdate({ documentStatus: 'pending' }, payload({ eventType: 'document-completed', timestamp: 'not a date' }), now)!;
    expect(u['completionTime']).toEqual(now);
  });
});

describe('splitDeepSignEvent / deepSignDedupeKey', () => {
  const req = { method: 'POST', rawBody: undefined, query: { esignId: 'e1' }, header: () => undefined } as WebhookRequest;

  it('reads the JSON body and takes esignId from the query', () => {
    const out = splitDeepSignEvent(Buffer.from('{"eventType":"document-completed","esignId":"spoofed"}'), req);
    expect(out).toEqual([{ eventType: 'document-completed', esignId: 'e1' }]);
  });

  it('keeps only the known fields, as strings, so the stored row is always writable', () => {
    const body = '{"eventType":"signee-completed","signeeId":"a","timestamp":5,"documentId":["x"],"nested":{"a":[[1]]},"extra":"x"}';
    expect(splitDeepSignEvent(Buffer.from(body), req)).toEqual([{ esignId: 'e1', eventType: 'signee-completed', signeeId: 'a' }]);
  });

  it('throws on a body that is not a JSON object', () => {
    expect(() => splitDeepSignEvent(Buffer.from('[1]'), req)).toThrow();
    expect(() => splitDeepSignEvent(Buffer.from('nope'), req)).toThrow();
  });

  it('builds the dedupe key from esignId, eventType, signeeId and timestamp', () => {
    expect(deepSignDedupeKey({ esignId: 'e1', eventType: 'signee-completed', signeeId: 'a', timestamp: 't' })).toBe('e1|signee-completed|a|t');
    expect(deepSignDedupeKey({ esignId: 'e1', eventType: 'document-completed' })).toBe('e1|document-completed||');
  });
});

describe('makeDeepSignHandler', () => {
  const row = (p: unknown): StoredWebhookEvent => ({ clientId: 'deepsign', type: 'deepsign', tenants: [], payload: p }) as unknown as StoredWebhookEvent;

  it('handles an update and reports the record tenant', async () => {
    const run = vi.fn(async (_id: string, decide: (r: Record<string, unknown>) => unknown) => {
      decide({ documentStatus: 'pending' });
      return { found: true as const, tenantId: 'scs', updated: true };
    });
    const out = await makeDeepSignHandler(run)(row(payload({ eventType: 'document-completed' })), 'ev1');
    expect(out).toEqual({ state: 'handled', tenantId: 'scs' });
    expect(run).toHaveBeenCalledWith('e1', expect.any(Function));
  });

  it('ignores a record with nothing to change, keeping the tenant', async () => {
    const run = async () => ({ found: true as const, tenantId: 'scs', updated: false });
    expect(await makeDeepSignHandler(run)(row(payload({})), 'ev1')).toEqual({ state: 'ignored', tenantId: 'scs' });
  });

  it('ignores a missing record', async () => {
    const run = async () => ({ found: false as const });
    expect(await makeDeepSignHandler(run)(row(payload({})), 'ev1')).toEqual({ state: 'ignored' });
  });

  it('ignores a missing or empty esignId without running', async () => {
    const run = vi.fn();
    expect(await makeDeepSignHandler(run)(row({ eventType: 'document-completed' }), 'ev1')).toEqual({ state: 'ignored' });
    expect(await makeDeepSignHandler(run)(row({ esignId: '' }), 'ev1')).toEqual({ state: 'ignored' });
    expect(run).not.toHaveBeenCalled();
  });

  it('fails without quoting the payload', async () => {
    await expect(makeDeepSignHandler(vi.fn())(row('secret-text'), 'ev1')).rejects.toThrow(/^(?!.*secret-text)/);
  });

  it('logs client id, event type and state only', async () => {
    const log = vi.fn();
    const run = async () => ({ found: true as const, updated: true });
    await makeDeepSignHandler(run, log)(row(payload({ eventType: 'document-completed', signeeId: 'a' })), 'ev1');
    expect(log).toHaveBeenCalledWith('deepsign', 'document-completed', 'handled');
  });
});

describe('DeepSign clients', () => {
  const req = (query: Record<string, string>): WebhookRequest => ({ method: 'POST', rawBody: Buffer.from('{}'), query, header: () => undefined });
  const verify = (c: typeof deepSignClient, query: Record<string, string>, secret: string) => {
    if (c.auth.kind !== 'record-token') throw new Error('not a record-token client');
    return c.auth.verify(req(query), secret);
  };

  it('accepts a token made with the client key and rejects one made with the other key', () => {
    const token = computeWebhookToken('e1', 'key-a');
    expect(verify(deepSignClient, { esignId: 'e1', token }, 'key-a')).toBe(true);
    expect(verify(deepSignClient, { esignId: 'e1', token }, 'key-b')).toBe(false);
    expect(verify(deepSignLegacyClient, { esignId: 'e1', token }, 'key-a')).toBe(true);
  });

  it('rejects a call without esignId or token', () => {
    const token = computeWebhookToken('e1', 'key-a');
    expect(verify(deepSignClient, { token }, 'key-a')).toBe(false);
    expect(verify(deepSignClient, { esignId: 'e1' }, 'key-a')).toBe(false);
    expect(verify(deepSignClient, {}, 'key-a')).toBe(false);
  });

  it('has the declared identity, and no route for the legacy client', () => {
    expect(deepSignClient.id).toBe('deepsign');
    expect(deepSignLegacyClient.id).toBe('deepsign-legacy');
    expect(findClient('deepsign')).toBe(deepSignClient);
    expect(findClient('deepsign-legacy')).toBeUndefined();
  });
});

describe('which key signs and verifies what', () => {
  it('binds the new client to webhookTokenSecret and the legacy client to webhookSecret', () => {
    expect(deepSignClient.auth.secret).toBe(webhookTokenSecret);
    expect(deepSignLegacyClient.auth.secret).toBe(webhookSecret);
  });
  it('signs the URL token of a new document with webhookTokenSecret', () => {
    const tokenValue = vi.spyOn(webhookTokenSecret, 'value').mockReturnValue('new-key');
    const legacyValue = vi.spyOn(webhookSecret, 'value').mockReturnValue('legacy-key');
    expect(newDocumentWebhookToken('e1')).toBe(computeWebhookToken('e1', 'new-key'));
    expect(legacyValue).not.toHaveBeenCalled();
    tokenValue.mockRestore();
    legacyValue.mockRestore();
  });
});

describe('ESIGN_LEGACY_CUTOFF_ISO', () => {
  it('is empty or a parseable date', () => {
    expect(ESIGN_LEGACY_CUTOFF_ISO === '' || !Number.isNaN(new Date(ESIGN_LEGACY_CUTOFF_ISO).getTime())).toBe(true);
  });
});

describe('refusedByCutoff', () => {
  it('throws for a cutoff that does not parse (fail closed)', async () => {
    expect(() => refusedByCutoff(Timestamp.fromMillis(1), 'not-a-date')).toThrow();
    const deps = { verify: () => false, readCreatedAt: async () => ({ exists: false }) };
    await expect(legacyGate({ method: 'POST', rawBody: Buffer.from(''), query: {}, header: () => undefined }, 'not-a-date', deps)).rejects.toThrow();
  });
  const cutoff = '2026-06-01T00:00:00Z';
  const at = (iso: string) => Timestamp.fromDate(new Date(iso));

  it('does not refuse anything while the cutoff is empty', () => {
    expect(refusedByCutoff(at('2030-01-01T00:00:00Z'), '')).toBe(false);
    expect(refusedByCutoff(undefined, '')).toBe(false);
  });
  it('refuses a record created after the cutoff', () => {
    expect(refusedByCutoff(at('2026-07-01T00:00:00Z'), cutoff)).toBe(true);
  });
  it('does not refuse a record created before the cutoff', () => {
    expect(refusedByCutoff(at('2026-05-01T00:00:00Z'), cutoff)).toBe(false);
  });
  it('refuses a record with no createdAt once a cutoff is set', () => {
    expect(refusedByCutoff(undefined, cutoff)).toBe(true);
  });
});

describe('empty secret', () => {
  it('rejects a token computed with an empty key', () => {
    const forged = computeWebhookToken('e1', '');
    expect(verifyWebhookToken('e1', forged, '')).toBe(false);
    const c = deepSignClient;
    if (c.auth.kind !== 'record-token') throw new Error('not record-token');
    const r: WebhookRequest = { method: 'POST', rawBody: Buffer.from('{}'), query: { esignId: 'e1', token: forged }, header: () => undefined };
    expect(c.auth.verify(r, '')).toBe(false);
  });
});

describe('legacyGate', () => {
  const cutoff = '2026-06-01T00:00:00Z';
  const req: WebhookRequest = { method: 'POST', rawBody: undefined, query: { esignId: 'e1', token: 't' }, header: () => undefined };
  const at = (iso: string) => Timestamp.fromDate(new Date(iso));
  const mk = (valid: boolean, read: () => Promise<{ exists: boolean; createdAt?: Timestamp }>) => ({
    verify: vi.fn(() => valid),
    readCreatedAt: vi.fn(read),
  });

  it('passes with an empty cutoff, without verify or read', async () => {
    const d = mk(true, async () => ({ exists: true }));
    expect(await legacyGate(req, '', d)).toBe('pass');
    expect(d.verify).not.toHaveBeenCalled();
    expect(d.readCreatedAt).not.toHaveBeenCalled();
  });
  it('passes an invalid token through without any read', async () => {
    const d = mk(false, async () => ({ exists: true }));
    expect(await legacyGate(req, cutoff, d)).toBe('pass');
    expect(d.readCreatedAt).not.toHaveBeenCalled();
  });
  it('refuses a record after the cutoff', async () => {
    const d = mk(true, async () => ({ exists: true, createdAt: at('2026-07-01T00:00:00Z') }));
    expect(await legacyGate(req, cutoff, d)).toBe('refuse');
    expect(d.readCreatedAt).toHaveBeenCalledWith('e1');
  });
  it('passes a record before the cutoff', async () => {
    const d = mk(true, async () => ({ exists: true, createdAt: at('2026-05-01T00:00:00Z') }));
    expect(await legacyGate(req, cutoff, d)).toBe('pass');
  });
  it('rejects when the read throws', async () => {
    const d = mk(true, async () => { throw new Error('boom'); });
    await expect(legacyGate(req, cutoff, d)).rejects.toThrow('boom');
  });
  it('passes a missing record', async () => {
    const d = mk(true, async () => ({ exists: false }));
    expect(await legacyGate(req, cutoff, d)).toBe('pass');
  });
});
