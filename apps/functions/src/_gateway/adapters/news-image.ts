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
//
// `snapshotPage` cameras (RediCam) store every still under a new name, so `feedUrl` is the HTML page
// that shows the newest one: the relay loads that page, takes its first `<img>` and fetches it. The
// image must be on the page's host. Loading the page makes such a camera take a photo, which the
// 60 s cache keeps to at most one a minute per tenant.

import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type { ProviderAdapter } from '../provider';
import { snapshotImageUrl } from './news-scrape';
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
      const imageUrl = channel.snapshotPage === true ? await resolveSnapshot(channel.feedUrl, deps) : channel.feedUrl;
      const res = await relayFetch(imageUrl, {
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

/** The current still of a snapshot page: its first `<img>`, on the page's own host. */
async function resolveSnapshot(pageUrl: string, deps: NewsRelayDeps): Promise<string> {
  const page = await relayFetch(pageUrl, { responseType: 'text', allowHttp: true, allowAnyPort: true, sameHost: true, accept: 'text/html', deps });
  const imageUrl = snapshotImageUrl(typeof page.data === 'string' ? page.data : '', page.finalUrl);
  if (!imageUrl || new URL(imageUrl).hostname !== new URL(pageUrl).hostname) {
    logger.warn('newsCenter: snapshot page without a same-host image', { host: new URL(pageUrl).hostname });
    throw new HttpsError('failed-precondition', 'no snapshot image', { reason: 'snapshot' });
  }
  return imageUrl;
}

export const newsImageAdapter = makeNewsImageAdapter({});
