import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AOC_STATUS_SERVICES } from '@okr/aoc-util';

import type { CacheEntry } from '../_gateway/cache';
import { loadServiceStatus, StatusDeps } from './get-service-status';

const NOW = 1_800_000_000_000;
const FEEDS = AOC_STATUS_SERVICES.filter(s => s.feedUrl);
const URLS = FEEDS.flatMap(s => [s.feedUrl, s.catalogUrl]).filter(Boolean);
const GITHUB_FEED = 'https://www.githubstatus.com/api/v2/summary.json';
const FIREBASE_PRODUCTS = 'https://status.firebase.google.com/products.json';

const githubBody = { components: [{ name: 'Git Operations', status: 'operational' }, { name: 'Actions', status: 'operational' }] };

describe('loadServiceStatus', () => {
  let deps: { fetch: ReturnType<typeof vi.fn>; readCache: ReturnType<typeof vi.fn>; writeCache: ReturnType<typeof vi.fn> };

  const run = () => loadServiceStatus(deps as unknown as StatusDeps, NOW);
  const row = (raw: unknown, expiresAtMs: number): CacheEntry<unknown> => ({ raw, sourceTimestamp: null, etag: null, storedAtMs: NOW - 1000, expiresAtMs });

  beforeEach(() => {
    deps = {
      fetch: vi.fn(async (url: string) => (url === GITHUB_FEED ? githubBody : [])),
      readCache: vi.fn(async () => null),
      writeCache: vi.fn(async () => undefined),
    };
  });

  it('returns a fresh cache row without fetching', async () => {
    const raw = { checkedAt: 'cached', services: {} };
    deps.readCache.mockResolvedValue(row(raw, NOW + 1));
    expect(await run()).toBe(raw);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('refetches an expired row', async () => {
    deps.readCache.mockResolvedValue(row({ checkedAt: 'cached', services: {} }, NOW));
    const result = await run();
    expect(deps.fetch).toHaveBeenCalledTimes(URLS.length);
    expect(result.checkedAt).toBe(new Date(NOW).toISOString());
  });

  it('leaves a working service alone when another feed fails', async () => {
    deps.fetch.mockImplementation(async (url: string) => {
      if (url === GITHUB_FEED) throw new Error('timeout');
      return [];
    });
    const result = await run();
    expect(result.services['github'].parts['Actions']).toEqual({ level: 'unknown' });
    expect(result.services['firebase'].parts['Hosting']).toEqual({ level: 'ok' });
  });

  it('caches the shared result for five minutes', async () => {
    const result = await run();
    expect(deps.writeCache).toHaveBeenCalledTimes(1);
    const [key, provider, scope, entry] = deps.writeCache.mock.calls[0];
    expect([key, provider, scope]).toEqual(['serviceStatus:shared', 'serviceStatus', 'shared']);
    expect(entry).toEqual({ raw: result, sourceTimestamp: null, etag: null, storedAtMs: NOW, expiresAtMs: NOW + 300_000 });
  });

  it('reads the cache under the key it writes', async () => {
    await run();
    expect(deps.readCache).toHaveBeenCalledWith('serviceStatus:shared');
  });

  it('reads a product gone from the list as unknown', async () => {
    deps.fetch.mockImplementation(async (url: string) => (url === FIREBASE_PRODUCTS ? { products: [{ title: 'Hosting' }] } : []));
    const { parts } = (await run()).services['firebase'];
    expect(parts['Hosting']).toEqual({ level: 'ok' });
    expect(parts['App Check']).toEqual({ level: 'unknown' });
  });

  it('does not grey a service when only its product list fails', async () => {
    deps.fetch.mockImplementation(async (url: string) => {
      if (url === FIREBASE_PRODUCTS) throw new Error('timeout');
      return [];
    });
    expect((await run()).services['firebase'].parts['App Check']).toEqual({ level: 'ok' });
  });

  it('does not cache when every feed failed', async () => {
    deps.fetch.mockRejectedValue(new Error('no network'));
    const result = await run();
    expect(deps.writeCache).not.toHaveBeenCalled();
    expect(result.services['firebase'].parts['Hosting']).toEqual({ level: 'unknown' });
  });

  it('fetches each feed once and nothing for a link-only service', async () => {
    await run();
    expect(deps.fetch.mock.calls.map(c => c[0]).sort()).toEqual([...URLS].sort());
    expect(Object.keys((await run()).services).sort()).toEqual(FEEDS.map(s => s.id).sort());
  });
});
