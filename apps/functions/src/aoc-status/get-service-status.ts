import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

import { AOC_STATUS_SERVICES, ServiceStatusResult } from '@okr/aoc-util';

import { getCallerContext } from '@okr/shared-util-functions';
import { requireAdmin } from '../business/shared';
import { CacheEntry, isExpired, readCache, writeCache } from '../_gateway/cache';
import { gatewayFetch } from '../_gateway/http';
import { parseFeed } from './status-parsers';
import { withSelftest } from './selftest-status';
import { WEBHOOK_SELFTEST_DOC, WebhookSelftestCollection, type WebhookSelftestResult } from '../_webhooks/selftest';
import { getFirestore } from 'firebase-admin/firestore';
import { WebhookEventCollection } from '../_webhooks/types';
import { makePingenClient, PINGEN_ENV, pingenClientId, pingenClientSecret, pingenOrganisationId } from '../pingen/pingen-client';
import { pingenWebhookSecret } from '../pingen/pingen-webhook';
import { newestRealWebhookMs, withPingenForOperator, type PingenOrganisationRead } from './pingen-status';

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
  const [feeds, catalogs] = await Promise.all([
    Promise.allSettled(services.map(s => deps.fetch(s.feedUrl as string))),
    // best effort: the feed decides the status, the list only spots a retired label
    Promise.all(services.map(s => (s.catalogUrl ? deps.fetch(s.catalogUrl).catch(() => undefined) : undefined))),
  ]);
  const result: ServiceStatusResult = {
    checkedAt: new Date(nowMs).toISOString(),
    services: Object.fromEntries(services.map((service, i) => {
      const feed = feeds[i];
      if (feed.status === 'rejected') logger.warn(`${CF_NAME}: no answer from ${service.id}`);
      return [service.id, parseFeed(service, feed.status === 'fulfilled' ? feed.value : undefined, catalogs[i])];
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
  { region: 'europe-west6', enforceAppCheck: true, maxInstances: 2, secrets: [pingenClientId, pingenClientSecret, pingenOrganisationId, pingenWebhookSecret] },
  async (request): Promise<ServiceStatusResult> => {
    await requireAdmin(request, CF_NAME);
    // Pingen is bkaiser's own prepaid account: only the platform operator sees (and triggers a read of) it
    const { isOperator } = await getCallerContext(request, CF_NAME);
    const now = Date.now();
    const [status, selftest] = await Promise.all([loadServiceStatus(LIVE_DEPS, now), readSelftest()]);
    return withPingenForOperator(withSelftest(status, selftest, now), isOperator, async () => {
      const [organisation, lastWebhookMs] = await Promise.all([readPingenOrganisation(now), readLastPingenWebhookMs()]);
      return { organisation, lastWebhookMs, selftest, nowMs: now };
    });
  },
);

const PINGEN_TTL_MS = 5 * 60 * 1000;
let pingenMemo: { at: number; read: PingenOrganisationRead } | undefined;

/** The organisation's balance. Memoised per instance for 5 minutes (a Pingen call per page open is needless); a failure is a code, never a throw. */
async function readPingenOrganisation(nowMs: number): Promise<PingenOrganisationRead> {
  if (pingenMemo && nowMs - pingenMemo.at < PINGEN_TTL_MS) return pingenMemo.read;
  try {
    const client = makePingenClient({
      fetch, now: () => nowMs, clientId: pingenClientId.value(), clientSecret: pingenClientSecret.value(),
      organisationId: pingenOrganisationId.value(), env: PINGEN_ENV,
    });
    const read = await client.readOrganisation();
    pingenMemo = { at: nowMs, read };
    return read;
  } catch (error) {
    const code = String((error as { status?: unknown })?.status ?? 'unavailable');
    logger.warn(`${CF_NAME}: pingen organisation unreadable`, { code });
    return { error: code };
  }
}

/** Newest real webhook. Needs the clientId + receivedAt index; until it is deployed the part reads unknown. */
async function readLastPingenWebhookMs(): Promise<number | undefined> {
  try {
    const snap = await getFirestore().collection(WebhookEventCollection)
      .where('clientId', '==', 'pingen').orderBy('receivedAt', 'desc').limit(10).get();
    return newestRealWebhookMs(snap.docs.map(d => ({ receivedAtMs: d.get('receivedAt').toMillis() as number, payload: d.get('payload') })));
  } catch (error) {
    logger.warn(`${CF_NAME}: pingen webhooks unreadable`, { error: String(error) });
    return undefined;
  }
}

/** Best effort: an unreadable result shows the receiver row as unknown, never fails the page. */
async function readSelftest(): Promise<WebhookSelftestResult | undefined> {
  try {
    return (await getFirestore().collection(WebhookSelftestCollection).doc(WEBHOOK_SELFTEST_DOC).get()).data() as WebhookSelftestResult | undefined;
  } catch (error) {
    logger.warn(`${CF_NAME}: selftest result unreadable`, { error: String(error) });
    return undefined;
  }
}
