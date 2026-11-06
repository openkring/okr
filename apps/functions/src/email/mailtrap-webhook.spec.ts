import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { makeMailtrapHandler, mailtrapClient, mailtrapDedupeKey, splitMailtrapEvents } from './mailtrap-webhook';
import type { StoredWebhookEvent } from '../_webhooks/types';

const buf = (s: string) => Buffer.from(s);

describe('splitMailtrapEvents', () => {
  it('splits a JSON array', () => {
    expect(splitMailtrapEvents(buf('[{"event":"delivery"},{"event":"open"}]'))).toEqual([{ event: 'delivery' }, { event: 'open' }]);
  });
  it('splits JSON Lines', () => {
    expect(splitMailtrapEvents(buf('{"event":"delivery"}\n\n{"event":"open"}\n'))).toEqual([{ event: 'delivery' }, { event: 'open' }]);
  });
  it('wraps a single object', () => {
    expect(splitMailtrapEvents(buf('{"event":"bounce"}'))).toEqual([{ event: 'bounce' }]);
  });
  it('splits a body of the form { events: [...] }', () => {
    expect(splitMailtrapEvents(buf('{"events":[{"event":"delivery"},{"event":"open"}]}'))).toEqual([{ event: 'delivery' }, { event: 'open' }]);
  });
  it('throws on invalid JSON', () => {
    expect(() => splitMailtrapEvents(buf('not json'))).toThrow();
  });
});

describe('mailtrapDedupeKey', () => {
  it('builds the same key for the same event', () => {
    const e = { event: 'delivery', message_id: 'm1', timestamp: 5, email: 'a@b.c' };
    expect(mailtrapDedupeKey({ ...e })).toBe(mailtrapDedupeKey({ ...e }));
    expect(mailtrapDedupeKey(e)).not.toBe(mailtrapDedupeKey({ ...e, event: 'open' }));
  });
  it('uses event_id when it is a non-empty string', () => {
    expect(mailtrapDedupeKey({ event_id: 'ev-1', event: 'open', message_id: 'm', timestamp: 1 })).toBe('ev-1');
  });
  it('falls back to message_id|event|timestamp without a usable event_id', () => {
    expect(mailtrapDedupeKey({ event_id: '', event: 'open', message_id: 'm', timestamp: 1 })).toBe('m|open|1');
    expect(mailtrapDedupeKey({ event: 'open', message_id: 'm', timestamp: 1 })).toBe('m|open|1');
  });
  it('hashes the whole event when it has no usable ids, and tells different events apart', () => {
    const a = { event: 'open', email: 'a@b.c' };
    const b = { event: 'open', email: 'x@y.z' };
    expect(mailtrapDedupeKey(a)).not.toBe(mailtrapDedupeKey(b));
    expect(mailtrapDedupeKey(a)).toBe(mailtrapDedupeKey({ ...a }));
    expect(mailtrapDedupeKey(a)).not.toContain('undefined');
    expect(mailtrapDedupeKey({ message_id: 'm', event: 'open' })).not.toContain('undefined');
  });
  it('does not throw for a non-object element', () => {
    expect(() => mailtrapDedupeKey(null)).not.toThrow();
    expect(() => mailtrapDedupeKey('text')).not.toThrow();
    expect(mailtrapDedupeKey(null)).not.toBe(mailtrapDedupeKey('text'));
  });
});

describe('mailtrapHandler', () => {
  it('writes emailEvents with the fields of today, under the row id', async () => {
    const write = vi.fn(async (_id: string, _data: Record<string, unknown>) => undefined);
    const receivedAt = Timestamp.fromMillis(1000);
    const expiresAt = Timestamp.fromMillis(2000);
    const row = { payload: { event: 'delivery', email: 'a@b.c', subject: 'S', message_id: 'm' }, receivedAt, expiresAt } as unknown as StoredWebhookEvent;
    const outcome = await makeMailtrapHandler(write)(row, 'row1');
    expect(outcome).toEqual({ state: 'handled' });
    expect(write).toHaveBeenCalledWith('row1', { event: 'delivery', email: 'a@b.c', subject: 'S', message_id: 'm', receivedAt, expiresAt });
  });
  it('keys the row on the root id of a replayed row, so a replay overwrites', async () => {
    const write = vi.fn(async (_id: string, _data: Record<string, unknown>) => undefined);
    const row = { payload: { event: 'delivery' }, replayOf: 'root1', replayedAt: Timestamp.fromMillis(5) } as unknown as StoredWebhookEvent;
    await makeMailtrapHandler(write)(row, 'root1-r1');
    expect(write.mock.calls[0][0]).toBe('root1');
  });
  it('fails without quoting the payload when it is not an object', async () => {
    const write = vi.fn(async () => undefined);
    const row = { payload: 'secret-text' } as unknown as StoredWebhookEvent;
    await expect(makeMailtrapHandler(write)(row, 'row1')).rejects.toThrow(/^(?!.*secret-text)/);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('mailtrapClient', () => {
  it('is declared as the platform HMAC client', () => {
    expect(mailtrapClient).toMatchObject({ id: 'mailtrap', type: 'mailtrap', tenant: { scope: 'platform' }, maxBodyBytes: 5_000_000, retentionDays: 30 });
    expect(mailtrapClient.auth).toMatchObject({ kind: 'hmac-body', header: 'Mailtrap-Signature' });
  });
});
