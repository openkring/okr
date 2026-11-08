// apps/functions/src/news/news-resolve.ts
//
// op `newsResolve` (design 2026-11-08 §7): an admin pastes a link (a YouTube channel, a Vimeo page,
// a feed, a web page, a webcam image) and gets back what a `news-channels` doc needs — kind, feed
// URL, site URL, name, avatar — plus the feed text for a preview.
//
// Admin/contentAdmin only, interactive, not cached and not a gateway adapter. The URL is
// admin-typed, so it runs under the same relay guards as newsFeed (relayFetch): https and port 443
// only, every resolved address and every redirect hop checked. The single exception: an `http:`
// URL (or one with an explicit port) is accepted when it serves a JPEG/PNG/WebP image — a webcam
// that only the newsImage relay can show, so it comes back with `viaRelay: true`.
//
// No DOM in functions: the page and feed are scanned with plain string/regex helpers below.

import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { NEWS_SEGMENTS, type NewsChannelKind, type NewsSegment } from '@okr/shared-models';
import { gatewayFetch } from '../_gateway/http';
import { contentTypeOf, relayFetch, type NewsRelayDeps, type RelayFetchOptions } from '../_gateway/adapters/news-feed';
import { NEWS_IMAGE_TYPES } from '../_gateway/adapters/news-image';

export interface ResolvedNewsSource {
  kind: NewsChannelKind;
  feedUrl: string;
  siteUrl: string;
  name: string;
  avatarUrl: string;
  /** The feed text for a preview; '' for an image. */
  body: string;
  /** True for an `http:` webcam: it can only be shown through the newsImage relay. */
  viaRelay: boolean;
}

const MAX_URL_LENGTH = 2048;
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com'];
const UC_ID = /UC[\w-]{22}/;
const ACCEPTED_CONTENT_TYPE = /xml|rss|atom|json|html/i;

const SEGMENT_KINDS: Record<NewsSegment, NewsChannelKind[]> = {
  video: ['youtube', 'vimeo'],
  audio: ['podcast'],
  text: ['rss'],
  webcam: ['image'],
};

/** Which channel kinds a segment's tab can show. */
export function segmentAccepts(segment: NewsSegment, kind: NewsChannelKind): boolean {
  return SEGMENT_KINDS[segment]?.includes(kind) ?? false;
}

/** «Für diesen Link haben wir keinen Feed gefunden.» — the client maps `details.reason`. */
function noFeed(): HttpsError {
  return new HttpsError('not-found', 'no-feed', { reason: 'no-feed' });
}

// ---------------------------------------------------------------- string helpers (no DOM)

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Plain text of a markup fragment: CDATA unwrapped, tags dropped, entities decoded, whitespace folded. */
function plainText(s: string): string {
  const unwrapped = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(unwrapped.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** The attribute strings of every `<name …>` tag. */
function tagsOf(markup: string, name: string): Record<string, string>[] {
  const re = new RegExp(`<${name}\\b([^>]*)>`, 'gi');
  const out: Record<string, string>[] = [];
  for (const m of markup.matchAll(re)) out.push(attrsOf(m[1]));
  return out;
}

function attrsOf(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/** Inner markup of the first `<tag>…</tag>` (exact tag name, so `title` never matches `media:title`). */
function innerOf(markup: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag.replace(':', '\\:')}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag.replace(':', '\\:')}>`, 'i');
  return markup.match(re)?.[1];
}

function metaContent(html: string, key: string): string | undefined {
  const tag = tagsOf(html, 'meta').find((a) => (a['property'] ?? a['name'] ?? a['itemprop'] ?? '').toLowerCase() === key);
  return tag?.['content'] || undefined;
}

function httpsOrEmpty(raw: string | undefined, base?: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

function httpUrlOrEmpty(raw: string | undefined, base?: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

/** Markup before the first item/entry: where channel-level title, link and image live. */
function feedHead(xml: string): string {
  const i = xml.search(/<(item|entry)[\s>]/i);
  return i >= 0 ? xml.slice(0, i) : xml;
}

/** The XML root after the BOM, the declaration, comments and a doctype. */
function xmlRoot(body: string): string {
  return body.replace(/^\uFEFF/, '').replace(/^\s*(?:<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*/i, '');
}

function hasAudioEnclosure(xml: string): boolean {
  const audio = (a: Record<string, string>) =>
    (a['type'] ?? '').toLowerCase().startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav)(\?|$)/i.test(a['url'] ?? a['href'] ?? '');
  if (tagsOf(xml, 'enclosure').some(audio)) return true;
  return tagsOf(xml, 'link').some((a) => (a['rel'] ?? '').toLowerCase() === 'enclosure' && audio(a));
}

// ---------------------------------------------------------------- exported pure helpers

/**
 * What a response is: a feed kind (sniffed from the body first, since servers often send RSS as
 * text/html or text/plain), `image` for `image/*`, `html` for a web page, else undefined.
 */
export function detectNewsKind(contentType: string, body: string): NewsChannelKind | 'html' | undefined {
  const ct = contentType.toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  const root = xmlRoot(body);
  if (/^<(rss|rdf:RDF)[\s>]/i.test(root)) return hasAudioEnclosure(body) ? 'podcast' : 'rss';
  if (/^<feed[\s>]/i.test(root)) {
    if (/<yt:channelId>|xmlns:yt=/i.test(feedHead(root))) return 'youtube';
    return hasAudioEnclosure(body) ? 'podcast' : 'rss';
  }
  if (ct.includes('html') || /^<html[\s>]/i.test(root)) return 'html';
  return undefined;
}

/** The channel id (`UC…`) of a YouTube channel page — the page's own, not a recommended channel's. */
export function youtubeChannelId(html: string): string | undefined {
  const candidates = [
    metaContent(html, 'identifier'),
    tagsOf(html, 'link').find((a) => (a['rel'] ?? '').toLowerCase() === 'canonical')?.['href'],
    html.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/)?.[1],
    metaContent(html, 'og:url'),
    html.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/)?.[1],
  ];
  for (const c of candidates) {
    const id = c?.match(UC_ID)?.[0];
    if (id) return id;
  }
  return undefined;
}

/** The first `<link rel="alternate" type="application/rss+xml|atom+xml" href>` of a page, absolute. */
export function alternateFeedUrl(html: string, baseUrl: string): string | undefined {
  for (const a of tagsOf(html, 'link')) {
    const rel = (a['rel'] ?? '').toLowerCase().split(/\s+/);
    const type = (a['type'] ?? '').toLowerCase().split(';')[0].trim();
    if (!rel.includes('alternate') || !['application/rss+xml', 'application/atom+xml'].includes(type) || !a['href']) continue;
    const abs = httpUrlOrEmpty(a['href'], baseUrl);
    if (abs) return abs;
  }
  return undefined;
}

interface FeedMeta {
  title: string;
  siteUrl: string;
  avatarUrl: string;
}

function feedMeta(xml: string, feedUrl: string): FeedMeta {
  const head = feedHead(xml);
  const rssLink = head.match(/<link>\s*([^<\s]+)\s*<\/link>/i)?.[1];
  const atomLink = tagsOf(head, 'link').find((a) => a['href'] && (a['rel'] ?? 'alternate').toLowerCase() === 'alternate')?.['href'];
  const image = innerOf(head, 'image');
  const avatar =
    tagsOf(head, 'itunes:image')[0]?.['href'] ??
    (image ? innerOf(image, 'url') : undefined) ??
    innerOf(head, 'logo') ??
    innerOf(head, 'icon');
  return {
    title: plainText(innerOf(head, 'title') ?? ''),
    siteUrl: httpUrlOrEmpty(rssLink ? decodeEntities(rssLink) : atomLink, feedUrl),
    avatarUrl: httpsOrEmpty(avatar ? plainText(avatar) : undefined, feedUrl),
  };
}

function pageTitle(html: string): string {
  return plainText(metaContent(html, 'og:title') ?? innerOf(html, 'title') ?? '');
}

// ---------------------------------------------------------------- the op

type ResolveDeps = Pick<NewsRelayDeps, 'fetch' | 'lookup'>;

interface Fetched {
  contentType: string;
  bytes: Buffer;
  finalUrl: string;
}

/** relayFetch with resolve's error mapping: a refused address is the admin's input → invalid-argument; any upstream failure → no feed. */
async function get(url: string, deps: ResolveDeps, opts: Partial<Omit<RelayFetchOptions, 'deps'>> = {}): Promise<Fetched> {
  try {
    const res = await relayFetch(url, { responseType: 'arraybuffer', accept: '*/*', ...opts, deps });
    const data = res.data;
    const bytes = Buffer.isBuffer(data) ? data : typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from((data ?? new ArrayBuffer(0)) as ArrayBuffer);
    return { contentType: contentTypeOf(res.headers), bytes, finalUrl: res.finalUrl };
  } catch (err) {
    if (err instanceof HttpsError && err.code === 'failed-precondition') {
      throw new HttpsError('invalid-argument', 'address not allowed', { reason: 'blocked' });
    }
    throw noFeed();
  }
}

function asText(f: Fetched): string {
  return f.bytes.toString('utf8');
}

function mediaType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

function parseInput(data: unknown): { url: URL; segment: NewsSegment } {
  const d = (data ?? {}) as { url?: unknown; segment?: unknown };
  if (typeof d.segment !== 'string' || !NEWS_SEGMENTS.includes(d.segment as NewsSegment)) {
    throw new HttpsError('invalid-argument', 'segment is required', { reason: 'segment' });
  }
  if (typeof d.url !== 'string' || d.url.trim() === '' || d.url.length > MAX_URL_LENGTH) {
    throw new HttpsError('invalid-argument', 'url is required', { reason: 'url' });
  }
  const trimmed = d.url.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new HttpsError('invalid-argument', 'url is invalid', { reason: 'url' });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new HttpsError('invalid-argument', 'only http(s) links', { reason: 'url' });
  }
  return { url, segment: d.segment as NewsSegment };
}

/** `http:` or an explicit port: only a JPEG/PNG/WebP image is accepted (newsImage relays it). */
async function resolveRelayImage(url: URL, deps: ResolveDeps): Promise<ResolvedNewsSource> {
  const f = await get(url.href, deps, { allowHttp: true, allowAnyPort: true, accept: NEWS_IMAGE_TYPES.join(', ') });
  if (!NEWS_IMAGE_TYPES.includes(mediaType(f.contentType))) {
    throw new HttpsError('invalid-argument', 'http links only for webcam images', { reason: 'http-not-image' });
  }
  return { kind: 'image', feedUrl: url.href, siteUrl: '', name: url.hostname, avatarUrl: '', body: '', viaRelay: url.protocol === 'http:' };
}

async function resolveYoutube(url: URL, deps: ResolveDeps): Promise<ResolvedNewsSource> {
  const segs = url.pathname.split('/').filter((s) => s !== '');
  let id: string | undefined;
  let channelPath: string | undefined;
  if (segs[0] === 'channel' && segs[1] && UC_ID.test(segs[1])) {
    id = segs[1].match(UC_ID)?.[0];
    channelPath = `channel/${segs[1]}`;
  } else if (segs[0]?.startsWith('@') && segs[0].length > 1) {
    channelPath = segs[0];
  } else if ((segs[0] === 'c' || segs[0] === 'user') && segs[1]) {
    channelPath = `${segs[0]}/${segs[1]}`;
  }
  if (!channelPath) throw noFeed(); // a video (/watch, /shorts, /live, /embed) or a playlist is not a channel
  let page = '';
  try {
    page = asText(await get(`https://www.youtube.com/${channelPath}`, deps, { responseType: 'text', accept: 'text/html' }));
  } catch (err) {
    if (!id) throw err;
  }
  id = id ?? youtubeChannelId(page);
  if (!id) throw noFeed();
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
  const body = asText(await get(feedUrl, deps, { responseType: 'text', accept: 'application/atom+xml, application/xml' }));
  if (detectNewsKind('text/xml', body) !== 'youtube') throw noFeed();
  const meta = feedMeta(body, feedUrl);
  return {
    kind: 'youtube',
    feedUrl,
    siteUrl: `https://www.youtube.com/channel/${id}`,
    name: meta.title || pageTitle(page).replace(/\s+-\s+YouTube$/, ''),
    avatarUrl: httpsOrEmpty(metaContent(page, 'og:image')),
    body,
    viaRelay: false,
  };
}

/** Vimeo pages without an alternate link: the documented feed paths. */
function vimeoFeedFallback(url: URL): string | undefined {
  const segs = url.pathname.split('/').filter((s) => s !== '');
  if (segs[0] === 'channels' && segs[1]) return `https://vimeo.com/channels/${segs[1]}/videos/rss`;
  if (segs.length === 1 && /^[\w-]+$/.test(segs[0])) return `https://vimeo.com/${segs[0]}/videos/rss`;
  return undefined;
}

async function resolveGeneric(url: URL, deps: ResolveDeps): Promise<ResolvedNewsSource> {
  const first = await get(url.href, deps);
  const ct = mediaType(first.contentType);
  if (ct.startsWith('image/')) {
    return { kind: 'image', feedUrl: url.href, siteUrl: '', name: url.hostname, avatarUrl: '', body: '', viaRelay: false };
  }
  if (!ACCEPTED_CONTENT_TYPE.test(ct)) throw noFeed();
  let body = asText(first);
  let kind = detectNewsKind(ct, body);
  let feedUrl = url.href;
  let page = '';
  if (kind === 'html') {
    page = body;
    let alt = alternateFeedUrl(page, first.finalUrl) ?? (VIMEO_HOSTS.includes(url.hostname) ? vimeoFeedFallback(url) : undefined);
    if (!alt) throw noFeed();
    if (alt.startsWith('http:')) alt = `https:${alt.slice('http:'.length)}`; // newsFeed is https-only
    const feed = await get(alt, deps);
    body = asText(feed);
    feedUrl = alt;
    kind = detectNewsKind(mediaType(feed.contentType), body);
  }
  if (kind !== 'rss' && kind !== 'podcast' && kind !== 'youtube') throw noFeed();
  if (kind === 'rss' && VIMEO_HOSTS.includes(new URL(feedUrl).hostname)) kind = 'vimeo';
  const meta = feedMeta(body, feedUrl);
  return {
    kind,
    feedUrl,
    siteUrl: meta.siteUrl || (page ? first.finalUrl : ''),
    name: meta.title || pageTitle(page) || url.hostname,
    avatarUrl: meta.avatarUrl || httpsOrEmpty(metaContent(page, 'og:image')),
    body,
    viaRelay: false,
  };
}

/** The `newsResolve` op handler (seams injectable for tests). */
export function makeNewsResolve(overrides: Partial<ResolveDeps>) {
  const deps: ResolveDeps = { fetch: gatewayFetch, ...overrides };
  return async (request: CallableRequest<unknown>): Promise<ResolvedNewsSource> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const token = request.auth.token as Record<string, unknown> | undefined;
    if (token?.['admin'] !== true && token?.['contentAdmin'] !== true) {
      throw new HttpsError('permission-denied', 'admin or contentAdmin required');
    }
    const { url, segment } = parseInput(request.data);
    let res: ResolvedNewsSource;
    try {
      if (url.hostname === 'youtu.be') throw noFeed(); // a share link names a video, never a channel
      if (url.protocol === 'http:' || url.port !== '') res = await resolveRelayImage(url, deps);
      else if (YOUTUBE_HOSTS.includes(url.hostname)) res = await resolveYoutube(url, deps);
      else res = await resolveGeneric(url, deps);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.warn('newsCenter: resolve failed', { host: url.hostname });
      throw noFeed();
    }
    if (!segmentAccepts(segment, res.kind)) {
      throw new HttpsError('invalid-argument', `a ${res.kind} source does not fit the ${segment} tab`, { reason: 'segment', kind: res.kind });
    }
    return res;
  };
}

export const newsResolve = makeNewsResolve({});
