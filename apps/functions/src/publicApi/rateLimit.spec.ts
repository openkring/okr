import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';

// In-memory `_rateLimits` with a serial transaction, enough for the counter logic.
const store = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));
vi.mock('firebase-admin/firestore', () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const ref = (path: string) => ({ path });
  const db = {
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
      get: async (r: { path: string }) => ({ exists: store.docs.has(r.path), data: () => store.docs.get(r.path) }),
      set: (r: { path: string }, d: Record<string, unknown>) => { store.docs.set(r.path, { ...d }); },
      update: (r: { path: string }, d: Record<string, unknown>) => { store.docs.set(r.path, { ...store.docs.get(r.path), ...d }); },
    }),
  };
  return { getFirestore: () => db, Timestamp: { fromMillis: ts } };
});

import { checkRateLimit, clientIp, rateLimitRef, refundRateLimit } from './rateLimit';

function reqWith(headers: Record<string, unknown>, ip?: string): Request {
  return { headers, ip } as unknown as Request;
}

describe('clientIp', () => {
  it('takes the first token of x-forwarded-for', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('trims whitespace', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '  9.9.9.9 , 1.1.1.1' }))).toBe('9.9.9.9');
  });

  it('handles an array-valued header', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': ['2.2.2.2, 3.3.3.3'] }))).toBe('2.2.2.2');
  });

  it('falls back to req.ip when no forwarded header', () => {
    expect(clientIp(reqWith({}, '4.4.4.4'))).toBe('4.4.4.4');
  });

  it('falls back to "unknown" when nothing is available', () => {
    expect(clientIp(reqWith({}))).toBe('unknown');
  });
});

describe('rateLimitRef', () => {
  it('is one doc per bucket:key, the key hashed (never the raw IP/token in the id)', () => {
    const a = rateLimitRef('transferPw', 'k1') as unknown as { path: string };
    expect(a.path).toMatch(/^_rateLimits\/transferPw_[0-9a-f]{32}$/);
    expect(a.path).not.toContain('k1');
    expect((rateLimitRef('transferPw', 'k1') as unknown as { path: string }).path).toBe(a.path);
    expect((rateLimitRef('transferPwT', 'k1') as unknown as { path: string }).path).not.toBe(a.path);
  });
});

describe('checkRateLimit / refundRateLimit', () => {
  const opts = { limit: 2, windowMs: 60_000 };
  const count = (bucket: string, key: string) =>
    store.docs.get((rateLimitRef(bucket, key) as unknown as { path: string }).path)?.['count'];
  beforeEach(() => { store.docs.clear(); });

  it('counts up to the limit, then refuses without counting further', async () => {
    expect((await checkRateLimit('b', 'k', opts)).allowed).toBe(true);
    expect((await checkRateLimit('b', 'k', opts)).allowed).toBe(true);
    expect((await checkRateLimit('b', 'k', opts)).allowed).toBe(false);
    expect(count('b', 'k')).toBe(2);
  });

  it('a refund frees one slot in the current window', async () => {
    await checkRateLimit('b', 'k', opts);
    await checkRateLimit('b', 'k', opts);
    await refundRateLimit('b', 'k');
    expect(count('b', 'k')).toBe(1);
    expect((await checkRateLimit('b', 'k', opts)).allowed).toBe(true);
  });

  it('never goes below 0 and ignores a missing counter', async () => {
    await refundRateLimit('b', 'none');
    expect(count('b', 'none')).toBeUndefined();
    await checkRateLimit('b', 'k', opts);
    await refundRateLimit('b', 'k');
    await refundRateLimit('b', 'k');
    expect(count('b', 'k')).toBe(0);
  });

  it('leaves a lapsed window alone', async () => {
    await checkRateLimit('b', 'k', opts);
    const path = (rateLimitRef('b', 'k') as unknown as { path: string }).path;
    store.docs.set(path, { ...store.docs.get(path), expiresAt: { toMillis: () => Date.now() - 1 } });
    await refundRateLimit('b', 'k');
    expect(count('b', 'k')).toBe(1);
  });
});
