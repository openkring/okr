import { NewsChannelModel, NewsChannelKind } from '@okr/shared-models';
import { NewsItem } from './news-item';

/** The feed text is not a readable RSS/Atom document (an HTML page, a broken download, a foreign root). */
export class NewsFeedParseError extends Error {
  constructor(message = 'not a feed') {
    super(message);
    this.name = 'NewsFeedParseError';
  }
}

const NS_MEDIA = 'http://search.yahoo.com/mrss/';
const NS_YT = 'http://www.youtube.com/xml/schemas/2015';
const NS_ITUNES = 'http://www.itunes.com/dtds/podcast-1.0.dtd';

/** Parses a feed and returns its newest `max` entries, in feed order. Throws NewsFeedParseError for a non-feed. */
export function parseNewsFeed(xml: string, kind: NewsChannelKind, channelKey: string, max = 20): NewsItem[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (doc.getElementsByTagName('parsererror').length > 0 || !root || !['rss', 'feed'].includes(root.localName)) {
    throw new NewsFeedParseError();
  }
  const entries = Array.from(doc.getElementsByTagName(root.localName === 'rss' ? 'item' : 'entry'));
  const feedImage = feedImageOf(root);
  return entries.slice(0, Math.max(0, max)).map((entry) => {
    const item = kind === 'youtube' ? youtubeItem(entry, channelKey) : genericItem(entry, kind, channelKey);
    // many podcast feeds (all of SRF's) carry artwork only once, for the whole feed
    if (!item.thumbnailUrl && feedImage) item.thumbnailUrl = feedImage;
    return item;
  });
}

/**
 * The feed's own artwork — direct children of the rss `<channel>` (itunes:image, else `<image><url>`)
 * or of the atom `<feed>` (`<logo>`, else `<icon>`). Direct children only, so an item-level image of
 * one entry never becomes the fallback for the others.
 */
function feedImageOf(root: Element): string | undefined {
  const container = root.localName === 'rss' ? Array.from(root.children).find((c) => c.localName === 'channel') : root;
  if (!container) return undefined;
  const kids = Array.from(container.children);
  const itunes = kids.find((c) => c.namespaceURI === NS_ITUNES && c.localName === 'image')?.getAttribute('href');
  if (safeUrl(itunes)) return safeUrl(itunes);
  const rssImage = kids.find((c) => c.localName === 'image' && c.namespaceURI !== NS_ITUNES);
  const rssUrl = rssImage ? Array.from(rssImage.children).find((c) => c.localName === 'url')?.textContent : undefined;
  if (safeUrl(rssUrl)) return safeUrl(rssUrl);
  const atom = kids.find((c) => c.localName === 'logo') ?? kids.find((c) => c.localName === 'icon');
  return safeUrl(atom?.textContent);
}

/** A webcam is a still image reloaded from the same url; the timestamp defeats every cache in between. */
export function webcamItem(channel: NewsChannelModel, nowMs: number): NewsItem {
  const url = `${channel.feedUrl}${channel.feedUrl.includes('?') ? '&' : '?'}t=${nowMs}`;
  return { id: `${channel.okey}-${nowMs}`, channelKey: channel.okey, title: channel.name, publishedAt: new Date(nowMs).toISOString(), mediaUrl: url, thumbnailUrl: url };
}

/** Text content of an HTML snippet: no markup, no scripts, whitespace collapsed. */
export function toPlainText(html: string | null | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** 'HH:MM:SS', 'MM:SS' or plain seconds → seconds; anything else → undefined. */
export function parseDuration(value: string | null | undefined): number | undefined {
  const v = (value ?? '').trim();
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+):)?(\d+):(\d{1,2})$/.exec(v);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function youtubeItem(entry: Element, channelKey: string): NewsItem {
  const rawId = textNS(entry, NS_YT, 'videoId');
  // the id ends up in an embed url path: accept only the YouTube id alphabet
  const videoId = /^[\w-]{1,32}$/.test(rawId) ? rawId : '';
  return {
    id: videoId || text(entry, 'id') || rawId,
    channelKey,
    title: toPlainText(text(entry, 'title')),
    publishedAt: toIso(text(entry, 'published') || text(entry, 'updated')),
    thumbnailUrl: safeUrl(attrNS(entry, NS_MEDIA, 'thumbnail', 'url')),
    mediaUrl: videoId || undefined,
    summary: summaryOf(textNS(entry, NS_MEDIA, 'description')),
    link: safeUrl(atomLink(entry)),
  };
}

function genericItem(entry: Element, kind: NewsChannelKind, channelKey: string): NewsItem {
  const link = safeUrl(entry.localName === 'entry' ? atomLink(entry) : text(entry, 'link'));
  const rawBody = text(entry, 'encoded') || text(entry, 'description') || text(entry, 'summary') || text(entry, 'content');
  const publishedAt = toIso(text(entry, 'pubDate') || text(entry, 'published') || text(entry, 'updated') || text(entry, 'date'));
  const item: NewsItem = {
    id: text(entry, 'guid') || text(entry, 'id') || link || `${channelKey}:${text(entry, 'title')}:${publishedAt}`,
    channelKey,
    title: toPlainText(text(entry, 'title')),
    publishedAt,
    thumbnailUrl: thumbnailOf(entry, rawBody),
    summary: summaryOf(rawBody),
    link,
  };
  if (kind === 'podcast') {
    item.mediaUrl = safeUrl(enclosure(entry)?.getAttribute('url'));
    item.durationSec = parseDuration(textNS(entry, NS_ITUNES, 'duration'));
  } else if (kind === 'vimeo') {
    item.mediaUrl = /vimeo\.com\/(?:.*\/)?(\d+)/.exec(link ?? '')?.[1];
  }
  return item;
}

/** media:thumbnail → image media:content → image enclosure → itunes:image → first <img> of the body. */
function thumbnailOf(entry: Element, rawBody: string): string | undefined {
  const fromMedia = attrNS(entry, NS_MEDIA, 'thumbnail', 'url');
  if (safeUrl(fromMedia)) return safeUrl(fromMedia);
  const content = Array.from(entry.getElementsByTagNameNS(NS_MEDIA, 'content')).find((c) => c.getAttribute('medium') === 'image' || (c.getAttribute('type') ?? '').startsWith('image/'));
  if (safeUrl(content?.getAttribute('url'))) return safeUrl(content?.getAttribute('url'));
  const enc = enclosure(entry);
  if ((enc?.getAttribute('type') ?? '').startsWith('image/') && safeUrl(enc?.getAttribute('url'))) return safeUrl(enc?.getAttribute('url'));
  const itunes = attrNS(entry, NS_ITUNES, 'image', 'href');
  if (safeUrl(itunes)) return safeUrl(itunes);
  if (!rawBody) return undefined;
  const img = new DOMParser().parseFromString(rawBody, 'text/html').querySelector('img');
  return safeUrl(img?.getAttribute('src'));
}

function enclosure(entry: Element): Element | undefined {
  return Array.from(entry.children).find((c) => c.localName === 'enclosure');
}

/** Atom: the `alternate` link (or the first one without a rel). */
function atomLink(entry: Element): string {
  const links = Array.from(entry.children).filter((c) => c.localName === 'link');
  const chosen = links.find((l) => (l.getAttribute('rel') ?? 'alternate') === 'alternate') ?? links[0];
  return chosen?.getAttribute('href') ?? '';
}

/** Text of a direct child by local name, whatever its namespace prefix. */
function text(entry: Element, localName: string): string {
  const child = Array.from(entry.children).find((c) => c.localName === localName);
  return (child?.textContent ?? '').trim();
}

function textNS(entry: Element, ns: string, localName: string): string {
  return (entry.getElementsByTagNameNS(ns, localName)[0]?.textContent ?? '').trim();
}

function attrNS(entry: Element, ns: string, localName: string, attr: string): string | undefined {
  return entry.getElementsByTagNameNS(ns, localName)[0]?.getAttribute(attr) ?? undefined;
}

function summaryOf(raw: string): string | undefined {
  return toPlainText(raw) || undefined;
}

/** Only http(s) urls are ever handed to the UI (no javascript:, data:). */
function safeUrl(url: string | null | undefined): string | undefined {
  const u = (url ?? '').trim();
  return /^https?:\/\/\S+$/i.test(u) ? u : undefined;
}

function toIso(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
