// apps/functions/src/_gateway/adapters/news-image.ts
//
// NewsCenter relayed webcam images (design 2026-11-08 §7.1): some club cameras serve only plain
// `http:` (often on port 8080), which an https app cannot show (mixed content), and some https
// cameras refuse hot-linking. For a channel an admin marked `viaRelay`, the client asks by
// channel key and gets the still image back as a data URL.
//
// `http:` and explicit ports are accepted ONLY here and only for such a channel; the address
// guard still applies to every connection, and a redirect may not switch to another host.
// The cache is per tenant and channel, 60 s, so many members watching one camera cause one
// upstream fetch a minute.

import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type { ProviderAdapter } from '../provider';
import { contentTypeOf, loadRelayChannel, NEWS_ATTRIBUTION, realNewsRelayDeps, relayFetch, type NewsChannelParams, type NewsRelayDeps } from './news-feed';

/** Image types the relay passes on: no SVG (script-capable), no GIF. */
export const NEWS_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface NewsImageRaw {
  dataUrl: string;
  contentType: string;
  fetchedAt: string;
}

export interface NewsImageData {
  dataUrl: string;
  contentType: string;
}

/** op `newsImage`: `{ channelKey }` → the current still of a `viaRelay` webcam channel of the caller's tenant. */
export function makeNewsImageAdapter(overrides: Partial<NewsRelayDeps>): ProviderAdapter<NewsChannelParams, NewsImageRaw, NewsImageData> {
  const deps: NewsRelayDeps = { ...realNewsRelayDeps, ...overrides };
  return {
    id: 'news-image',
    baseUrl: '', // no fixed upstream: the allowlist is the tenant's news-channels
    secrets: [],
    scope: 'tenant',
    ttlSeconds: 60,
    requiresAuth: true,
    windowLimit: { limit: 120, windowMs: 60_000 },
    attribution: NEWS_ATTRIBUTION,
    async fetch(params, ctx) {
      const channel = await loadRelayChannel(params, ctx, deps, (c) => c.kind === 'image' && c.viaRelay === true);
      const res = await relayFetch(channel.feedUrl, {
        responseType: 'arraybuffer',
        allowHttp: true,
        allowAnyPort: true,
        sameHost: true,
        accept: 'image/jpeg, image/png, image/webp',
        deps,
      });
      const contentType = contentTypeOf(res.headers).split(';')[0].trim().toLowerCase();
      if (!NEWS_IMAGE_TYPES.includes(contentType)) {
        logger.warn('newsCenter: image refused, unsupported content type', { host: new URL(channel.feedUrl).hostname, status: res.status });
        throw new HttpsError('failed-precondition', 'unsupported content type', { reason: 'content-type' });
      }
      const bytes = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data as ArrayBuffer);
      return { dataUrl: `data:${contentType};base64,${bytes.toString('base64')}`, contentType, fetchedAt: deps.now().toISOString() };
    },
    map: (raw) => ({ dataUrl: raw.dataUrl, contentType: raw.contentType }),
    sourceTimestamp: (raw) => raw.fetchedAt,
  };
}

export const newsImageAdapter = makeNewsImageAdapter({});
