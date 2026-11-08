// apps/functions/src/news/news-router.ts
//
// newsCenter — the NewsCenter relay callable (design 2026-11-08 §7, §7.1). Three ops:
//  - newsFeed    { channelKey }       → the feed text of a configured channel (members, cached 300 s)
//  - newsImage   { channelKey }       → a `viaRelay` webcam still as a data URL (members, cached 60 s)
//  - newsResolve { url, segment }     → channel fields for a pasted link (admin/contentAdmin, not cached)
// Members never send a URL; only newsResolve takes one, and only from an admin.
import { makeOpRouter, type OpHandler } from '../_router';
import { makeGatewayHandler } from '../_gateway/gateway';
import { newsFeedAdapter } from '../_gateway/adapters/news-feed';
import { newsImageAdapter } from '../_gateway/adapters/news-image';
import { newsResolve } from './news-resolve';

export const NEWS_OPS: Record<string, OpHandler> = {
  newsFeed: makeGatewayHandler(newsFeedAdapter) as OpHandler,
  newsImage: makeGatewayHandler(newsImageAdapter) as OpHandler,
  newsResolve: newsResolve as OpHandler,
};

export const NEWS_OPTIONS = {
  cors: true,
  region: 'europe-west6',
  enforceAppCheck: true,
  memory: '256MiB' as const,
};

export const newsCenter = makeOpRouter('newsCenter', NEWS_OPTIONS, NEWS_OPS);
