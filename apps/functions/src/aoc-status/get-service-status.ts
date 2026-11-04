import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

import { AOC_STATUS_SERVICES, ServiceStatusResult } from '@okr/aoc-util';

import { requireAdmin } from '../business/shared';
import { CacheEntry, isExpired, readCache, writeCache } from '../_gateway/cache';
import { gatewayFetch } from '../_gateway/http';
import { parseFeed } from './status-parsers';

const CF_NAME = 'getServiceStatus';
const CACHE_PROVIDER = 'serviceStatus';
const CACHE_SCOPE = 'shared';
const CACHE_KEY = `${CACHE_PROVIDER}:${CACHE_SCOPE}`;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FEED_TIMEOUT_MS = 5000;

export interface StatusDeps {
  fetch: (url: string) => Promise<unknown>;
  readCache: (key: string) => Promise<CacheEntry<ServiceStatusResult> | null>;
  writeCache: (key: string, providerId: string, scope: string, entry: CacheEntry<ServiceStatusResult>) => Promise<void>;
}

const LIVE_DEPS: StatusDeps = {
  fetch: async url => (await gatewayFetch(url, { timeoutMs: FEED_TIMEOUT_MS, maxRetries: 0 })).data,
  readCache,
  writeCache,
};

/**
 * One cached row for all tenants: the answer holds nothing tenant-specific, the page filters it. A
 * failed feed makes only its own service unknown. With no feed at all the result is not cached, so
 * the next caller tries again instead of reading five minutes of grey.
 */
export async function loadServiceStatus(deps: StatusDeps, nowMs: number): Promise<ServiceStatusResult> {
  const cached = await deps.readCache(CACHE_KEY);
  if (cached && !isExpired(cached, nowMs)) return cached.raw;

  const services = AOC_STATUS_SERVICES.filter(s => s.feedUrl);
  const feeds = await Promise.allSettled(services.map(s => deps.fetch(s.feedUrl as string)));
  const result: ServiceStatusResult = {
    checkedAt: new Date(nowMs).toISOString(),
    services: Object.fromEntries(services.map((service, i) => {
      const feed = feeds[i];
      if (feed.status === 'rejected') logger.warn(`${CF_NAME}: no answer from ${service.id}`);
      return [service.id, parseFeed(service, feed.status === 'fulfilled' ? feed.value : undefined)];
    })),
  };

  if (feeds.some(f => f.status === 'fulfilled')) {
    await deps.writeCache(CACHE_KEY, CACHE_PROVIDER, CACHE_SCOPE, {
      raw: result,
      sourceTimestamp: null,
      etag: null,
      storedAtMs: nowMs,
      expiresAtMs: nowMs + CACHE_TTL_MS,
    });
  }
  return result;
}

/**
 * The live status of the external services for the AOC page (spec 1.137). Takes no input: every URL
 * comes from the catalogue, so there is nothing to forge. `maxInstances` is deliberately low, as
 * europe-west6's CPU quota is full and the default of 20 is what eats it.
 */
export const getServiceStatus = onCall(
  { region: 'europe-west6', enforceAppCheck: true, maxInstances: 2 },
  async (request): Promise<ServiceStatusResult> => {
    await requireAdmin(request, CF_NAME);
    return loadServiceStatus(LIVE_DEPS, Date.now());
  },
);
