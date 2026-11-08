// apps/functions/src/_gateway/adapters/news-feed.ts
//
// NewsCenter relay (design 2026-11-08 §7): the members' client parses feeds itself but cannot
// read most of them directly (CORS), so it asks for a CHANNEL by key and this adapter fetches the
// channel's stored `feedUrl`. The client never sends a URL: only feeds an admin configured in
// `news-channels` are reachable, and only for members of that channel's tenant.
//
// Every fetch goes through `relayFetch`: the resolved-address guard up front, the same guard at
// socket level for every connection (DNS rebinding, redirects to hostnames), the shape guard in
// `beforeRedirect` for every hop (IP literals, scheme, port), at most 3 redirects, 8 s, 2 MB,
// no retries. Logs carry the host and the status only — feed paths may carry tokens.

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import { NewsChannelCollection, type NewsChannelModel } from '@okr/shared-models';
import type { GatewayContext, ProviderAdapter } from '../provider';
import { gatewayFetch, type GatewayFetchOptions } from '../http';
import { assertPublicResolvedUrl, assertPublicUrlShape, BlockedUrlError, guardedLookup, isBlockedUrlError, type PublicUrlOptions } from '../ssrf';

export const NEWS_RELAY_TIMEOUT_MS = 8000;
export const NEWS_RELAY_MAX_BYTES = 2 * 1024 * 1024;
export const NEWS_RELAY_MAX_REDIRECTS = 3;
const NEWS_WINDOW = { limit: 120, windowMs: 60_000 };
/** Content types the feed relay passes on (design §7); newsResolve applies the same rule. */
export const FEED_CONTENT_TYPE = /xml|rss|atom|json|html/i;
/** Firestore auto ids and hand-made keys; never a path separator, never `.`/`..`. */
const CHANNEL_KEY = /^[A-Za-z0-9_-]{1,128}$/;

/** The relay's attribution: the source is the club's own channel, which the client names itself. */
export const NEWS_ATTRIBUTION = { provider: 'NewsCenter', url: '' };

export interface NewsChannelParams {
  channelKey: string;
}

/** Injectable seams (Firestore, network, DNS, clock) so the adapters are unit-testable. */
export interface NewsRelayDeps {
  readChannel: (channelKey: string) => Promise<NewsChannelModel | undefined>;
  fetch: typeof gatewayFetch;
  /** DNS seam: host → all its addresses. Default: the system resolver. */
  lookup?: (host: string) => Promise<string[]>;
  now: () => Date;
}

async function readChannelDoc(channelKey: string): Promise<NewsChannelModel | undefined> {
  const snap = await getFirestore().collection(NewsChannelCollection).doc(channelKey).get();
  return snap.exists ? ({ ...(snap.data() as NewsChannelModel), okey: snap.id } as NewsChannelModel) : undefined;
}

export const realNewsRelayDeps: NewsRelayDeps = {
  readChannel: readChannelDoc,
  fetch: gatewayFetch,
  now: () => new Date(),
};

/**
 * The channel behind `channelKey` when the caller may use it, else `not-found` — the same answer
 * for missing, archived, foreign-tenant and wrong-kind channels, so the op reveals nothing.
 */
export async function loadRelayChannel(
  params: NewsChannelParams,
  ctx: GatewayContext,
  deps: Pick<NewsRelayDeps, 'readChannel'>,
  accepts: (channel: NewsChannelModel) => boolean,
): Promise<NewsChannelModel> {
  const key: unknown = params?.channelKey;
  if (typeof key !== 'string' || !CHANNEL_KEY.test(key)) {
    throw new HttpsError('invalid-argument', 'channelKey is required');
  }
  const channel = await deps.readChannel(key);
  const ok =
    !!channel &&
    channel.isArchived !== true &&
    Array.isArray(channel.tenants) &&
    ctx.tenantId !== '' &&
    channel.tenants.includes(ctx.tenantId) &&
    typeof channel.feedUrl === 'string' &&
    accepts(channel);
  if (!ok) throw new HttpsError('not-found', 'channel not found');
  return channel;
}

export interface RelayFetchOptions extends Pick<PublicUrlOptions, 'allowHttp' | 'allowAnyPort'> {
  responseType: 'text' | 'arraybuffer';
  /** Refuse a redirect to a different hostname (newsImage). */
  sameHost?: boolean;
  /** Accept header sent upstream. */
  accept?: string;
  deps: Pick<NewsRelayDeps, 'fetch' | 'lookup'>;
}

function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return '(invalid)';
  }
}

/** The URL follow-redirects is about to request, from the options it hands to `beforeRedirect`. */
function hopUrl(o: Record<string, unknown>): string {
  if (typeof o['href'] === 'string') return o['href'];
  return `${String(o['protocol'] ?? '')}//${String(o['host'] ?? o['hostname'] ?? '')}${String(o['path'] ?? '/')}`;
}

/**
 * Fetch an admin-configured URL under the relay guards. Throws `HttpsError('failed-precondition')`
 * when a guard refuses the URL or any hop, and a plain Error naming only the status otherwise
 * (the gateway logs that message and may serve stale cache).
 */
export async function relayFetch(url: string, opts: RelayFetchOptions): Promise<{ data: unknown; headers: Record<string, unknown>; status: number; finalUrl: string }> {
  const guard: PublicUrlOptions = { allowHttp: opts.allowHttp, allowAnyPort: opts.allowAnyPort, lookup: opts.deps.lookup };
  const host = hostOf(url);
  try {
    await assertPublicResolvedUrl(url, guard);
  } catch {
    logger.warn('newsCenter: address refused', { host });
    throw new HttpsError('failed-precondition', 'address not allowed', { reason: 'blocked' });
  }
  const originalHost = new URL(url).hostname;
  const fetchOpts: GatewayFetchOptions = {
    method: 'GET',
    responseType: opts.responseType,
    timeoutMs: NEWS_RELAY_TIMEOUT_MS,
    maxBytes: NEWS_RELAY_MAX_BYTES,
    maxRetries: 0,
    maxRedirects: NEWS_RELAY_MAX_REDIRECTS,
    // never through an env-configured proxy: the guarded lookup must see the real upstream host
    proxy: false,
    headers: { Accept: opts.accept ?? '*/*', 'User-Agent': 'openkring-newscenter/1.0' },
    // every hop: scheme, port, credentials, IP literals, and (newsImage) the host may not change
    beforeRedirect: (o: Record<string, unknown>) => {
      const next = assertPublicUrlShape(hopUrl(o), guard);
      if (opts.sameHost && next.hostname !== originalHost) {
        throw new BlockedUrlError(`Redirect from ${originalHost} to another host is not allowed`);
      }
    },
    // every connection (incl. redirects): the addresses actually connected to must be public
    lookup: guardedLookup(opts.deps.lookup) as unknown as GatewayFetchOptions['lookup'],
  };
  try {
    const res = await opts.deps.fetch<unknown>(url, fetchOpts);
    const finalUrl = (res.request as { res?: { responseUrl?: string } } | undefined)?.res?.responseUrl ?? url;
    return { data: res.data, headers: (res.headers ?? {}) as Record<string, unknown>, status: res.status, finalUrl };
  } catch (err: unknown) {
    if (isBlockedUrlError(err)) {
      logger.warn('newsCenter: address refused on connect/redirect', { host });
      throw new HttpsError('failed-precondition', 'address not allowed', { reason: 'blocked' });
    }
    const status = axios.isAxiosError(err) ? err.response?.status : (err as { response?: { status?: number } })?.response?.status;
    logger.warn('newsCenter: upstream failed', { host, status: status ?? null });
    throw new Error(`newsCenter upstream ${status ?? 'unreachable'}`);
  }
}

/** The `content-type` header value ('' when absent). */
export function contentTypeOf(headers: Record<string, unknown>): string {
  const v = headers['content-type'] ?? headers['Content-Type'];
  return typeof v === 'string' ? v : '';
}

export interface NewsFeedRaw {
  body: string;
  contentType: string;
  fetchedAt: string;
}

export interface NewsFeedData {
  body: string;
  contentType: string;
}

/** op `newsFeed`: `{ channelKey }` → the feed text of a non-image channel of the caller's tenant. */
export function makeNewsFeedAdapter(overrides: Partial<NewsRelayDeps>): ProviderAdapter<NewsChannelParams, NewsFeedRaw, NewsFeedData> {
  const deps: NewsRelayDeps = { ...realNewsRelayDeps, ...overrides };
  return {
    id: 'news-feed',
    baseUrl: '', // no fixed upstream: the allowlist is the tenant's news-channels
    secrets: [],
    scope: 'tenant',
    ttlSeconds: 300,
    requiresAuth: true,
    windowLimit: NEWS_WINDOW,
    attribution: NEWS_ATTRIBUTION,
    async fetch(params, ctx) {
      const channel = await loadRelayChannel(params, ctx, deps, (c) => c.kind !== 'image');
      const res = await relayFetch(channel.feedUrl, {
        responseType: 'text',
        accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
        deps,
      });
      const contentType = contentTypeOf(res.headers);
      if (!FEED_CONTENT_TYPE.test(contentType)) {
        logger.warn('newsCenter: unsupported content type', { host: hostOf(channel.feedUrl), status: res.status });
        throw new HttpsError('failed-precondition', 'unsupported content type', { reason: 'content-type' });
      }
      return { body: typeof res.data === 'string' ? res.data : String(res.data ?? ''), contentType, fetchedAt: deps.now().toISOString() };
    },
    map: (raw) => ({ body: raw.body, contentType: raw.contentType }),
    sourceTimestamp: (raw) => raw.fetchedAt,
  };
}

export const newsFeedAdapter = makeNewsFeedAdapter({});
