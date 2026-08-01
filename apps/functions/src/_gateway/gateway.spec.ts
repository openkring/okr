// apps/functions/src/_gateway/gateway.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runGateway, resolveTenantId, stripTenantId, GatewayDeps } from './gateway';
import type { ProviderAdapter } from './provider';

type P = { q: string };
type R = { payload: string; ts: string };
type M = { value: string };

const adapter: ProviderAdapter<P, R, M> = {
  id: 'fake',
  baseUrl: 'https://fake.test',
  secrets: [],
  scope: 'shared',
  ttlSeconds: 100,
  requiresAuth: false,
  attribution: { provider: 'Fake', url: 'https://fake.test' },
  fetch: vi.fn(async () => ({ payload: 'live', ts: '2026-07-23T00:00:00Z' })),
  map: (raw) => ({ value: raw.payload }),
  sourceTimestamp: (raw) => raw.ts,
};

const ctx = { tenantId: 'scs', uid: 'u1', isAdmin: false };

function fakeDeps(overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    checkWindowQuota: vi.fn(async () => undefined),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => undefined),
    getMonthlyCount: vi.fn(async () => 0),
    incrementMonthlyCount: vi.fn(async () => undefined),
    now: () => 1_000_000,
    ...overrides,
  };
}

describe('runGateway', () => {
  // The `adapter` fixture's `fetch` mock is shared (module-level) across all
  // tests in this describe block; reset call counts between tests so a later
  // `not.toHaveBeenCalled()` assertion isn't polluted by an earlier test's call.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches live on a cache miss, maps, attributes, and writes cache', async () => {
    const deps = fakeDeps();
    const res = await runGateway(adapter, { q: 'x' }, ctx, deps);
    expect(res.data).toEqual({ value: 'live' });
    expect(res.cached).toBe(false);
    expect(res.sourceTimestamp).toBe('2026-07-23T00:00:00Z');
    expect(res.attribution.provider).toBe('Fake');
    expect(adapter.fetch).toHaveBeenCalledOnce();
    expect(deps.writeCache).toHaveBeenCalledOnce();
    expect(deps.incrementMonthlyCount).toHaveBeenCalledOnce();
  });

  it('serves a fresh cache hit without fetching', async () => {
    const deps = fakeDeps({
      readCache: vi.fn(async () => ({
        raw: { payload: 'cached', ts: '2026-01-01T00:00:00Z' },
        sourceTimestamp: '2026-01-01T00:00:00Z',
        etag: null,
        storedAtMs: 999_000,
        expiresAtMs: 2_000_000, // fresh vs now=1_000_000
      })),
    });
    const res = await runGateway(adapter, { q: 'x' }, ctx, deps);
    expect(res.data).toEqual({ value: 'cached' });
    expect(res.cached).toBe(true);
    expect(adapter.fetch).not.toHaveBeenCalled();
    expect(deps.incrementMonthlyCount).not.toHaveBeenCalled();
  });

  it('serves stale cache when the monthly cap is breached', async () => {
    const capped = { ...adapter, monthlyCap: 5, fetch: vi.fn() };
    const deps = fakeDeps({
      getMonthlyCount: vi.fn(async () => 5),
      readCache: vi.fn(async () => ({
        raw: { payload: 'stale', ts: '2025-01-01T00:00:00Z' },
        sourceTimestamp: '2025-01-01T00:00:00Z',
        etag: null,
        storedAtMs: 1,
        expiresAtMs: 2, // expired vs now=1_000_000
      })),
    });
    const res = await runGateway(capped, { q: 'x' }, ctx, deps);
    expect(res.data).toEqual({ value: 'stale' });
    expect(res.stale).toBe(true);
    expect(capped.fetch).not.toHaveBeenCalled();
  });

  it('fails soft when the cap is breached and there is no cache', async () => {
    const capped = { ...adapter, monthlyCap: 5, fetch: vi.fn() };
    const deps = fakeDeps({ getMonthlyCount: vi.fn(async () => 5), readCache: vi.fn(async () => null) });
    await expect(runGateway(capped, { q: 'x' }, ctx, deps)).rejects.toThrow(/cap|exhausted|limit/i);
    expect(capped.fetch).not.toHaveBeenCalled();
  });
});

describe('resolveTenantId', () => {
  const read = vi.fn(async () => 'p13');

  beforeEach(() => vi.clearAllMocks());

  it('derives the tenant from the caller record, never from the payload', async () => {
    expect(await resolveTenantId('u1', 'shared', read)).toBe('p13');
    expect(read).toHaveBeenCalledWith('u1');
  });

  it('resolves anonymous callers to the empty tenant without a lookup', async () => {
    expect(await resolveTenantId(null, 'shared', read)).toBe('');
    expect(read).not.toHaveBeenCalled();
  });

  it('resolves a user with no tenant link to the empty tenant on a shared provider', async () => {
    expect(await resolveTenantId('u1', 'shared', vi.fn(async () => ''))).toBe('');
  });

  it('rejects an unresolvable tenant on a tenant-scoped provider', async () => {
    await expect(resolveTenantId('u1', 'tenant', vi.fn(async () => ''))).rejects.toThrow(
      /not linked to a tenant/i,
    );
    await expect(resolveTenantId(null, 'tenant', read)).rejects.toThrow(/not linked to a tenant/i);
  });
});

describe('stripTenantId', () => {
  it('removes a client-supplied tenantId so it cannot fragment the cache key', () => {
    expect(stripTenantId({ q: 'x', tenantId: 'other' })).toEqual({ q: 'x' });
  });

  it('leaves params without a tenantId untouched', () => {
    const params = { q: 'x' };
    expect(stripTenantId(params)).toBe(params);
  });

  it('tolerates non-object payloads', () => {
    expect(stripTenantId(undefined)).toBeUndefined();
    expect(stripTenantId(null)).toBeNull();
    expect(stripTenantId('x')).toBe('x');
  });
});
