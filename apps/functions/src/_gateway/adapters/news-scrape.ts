// apps/functions/src/_gateway/adapters/news-scrape.ts
//
// NewsCenter `kind: 'html'` channels (design 2026-11-08 §7.2): a site without a feed whose news
// list an admin described with CSS selectors (`NewsChannelModel.scrape`). The relay fetches the page
// and turns it into an RSS 2.0 document here, so the client parses it exactly like any other feed.
// Pure: no network, no Firestore — the adapter hands in the page text and its final URL.

import { parseDocument } from 'htmlparser2';
import { selectAll, selectOne } from 'css-select';
import { getAttributeValue, removeElement, textContent } from 'domutils';
import type { NewsScrapeConfig } from '@okr/shared-models';

// domhandler's node types, taken from domutils' signatures instead of importing a transitive package
type Element = Parameters<typeof getAttributeValue>[0];
type AnyNode = Exclude<Parameters<typeof textContent>[0], unknown[]>;

/** At most this many entries per page; the client shows fewer. */
export const SCRAPE_MAX_ITEMS = 50;
const MAX_SELECTOR_LENGTH = 200;
const MAX_TEXT_LENGTH = 500;

/** True when `scrape` has the required selectors and every selector is a non-empty, bounded string. */
export function isValidScrapeConfig(scrape: unknown): scrape is NewsScrapeConfig {
  if (!scrape || typeof scrape !== 'object') return false;
  const s = scrape as Record<string, unknown>;
  const ok = (v: unknown, required: boolean): boolean =>
    v === undefined || v === '' ? !required : typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_SELECTOR_LENGTH;
  return ok(s['item'], true) && ok(s['link'], true) && ok(s['title'], true) && ok(s['date'], false) && ok(s['image'], false) && ok(s['description'], false);
}

// C0 controls other than tab/LF/CR, lone surrogates and U+FFFE/U+FFFF are not allowed in XML 1.0;
// one of them in a scraped title would make the client's DOMParser reject the whole channel.
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** XML text escape (element content and attribute values); characters XML cannot carry are dropped. */
export function escapeXml(value: string): string {
  return value.replace(XML_INVALID, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function clean(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXT_LENGTH ? `${t.slice(0, MAX_TEXT_LENGTH - 1)}…` : t;
}

/** An absolute http(s) URL for `href` relative to `base`, or '' (never javascript:, data:, …). */
export function absoluteHttpUrl(href: string | undefined, base: string): string {
  if (!href) return '';
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

const ZURICH_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Zurich', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });

/** Europe/Zurich wall clock minus UTC, in ms, at instant `t`. */
function zurichOffsetMs(t: number): number {
  const p = Object.fromEntries(ZURICH_PARTS.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p['year'], p['month'] - 1, p['day'], p['hour'], p['minute'], p['second']) - Math.floor(t / 1000) * 1000;
}

/** The instant of a Swiss wall-clock time (the club's pages are written in Europe/Zurich, the relay runs in UTC). */
function zurichWallClock(y: number, m: number, d: number, h: number, mi: number): Date {
  const asUtc = Date.UTC(y, m - 1, d, h, mi);
  let t = asUtc - zurichOffsetMs(asUtc);
  t = asUtc - zurichOffsetMs(t); // second pass settles a DST boundary between the guess and the answer
  return new Date(t);
}

/**
 * RFC 822 date for a scraped date text: `dd.mm.yyyy` (Swiss, optionally `HH:MM` Europe/Zurich) or anything
 * `Date` parses as ISO. '' when the text is not a date. Day-only dates are taken as 12:00 UTC so
 * they never slip a day in the client's time zone.
 */
export function scrapedDateToRfc822(text: string): string {
  const t = text.trim();
  const ch = /(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/.exec(t);
  let d: Date | undefined;
  if (ch) {
    const [dd, mm, yyyy] = [Number(ch[1]), Number(ch[2]), Number(ch[3])];
    const day = new Date(Date.UTC(yyyy, mm - 1, dd, 12));
    if (day.getUTCDate() !== dd || day.getUTCMonth() !== mm - 1) return '';
    if (ch[4] === undefined) {
      d = day;
    } else {
      const [hh, mi] = [Number(ch[4]), Number(ch[5])];
      if (hh > 23 || mi > 59) return '';
      d = zurichWallClock(yyyy, mm, dd, hh, mi);
    }
  } else if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    d = new Date(t);
  }
  return d && !Number.isNaN(d.getTime()) ? d.toUTCString() : '';
}

/** The first element matching `selector` inside `item`, or the item itself when it matches. */
function pick(item: Element, selector: string | undefined): Element | null {
  if (!selector) return null;
  return selectOne<AnyNode, Element>(selector, item) ?? (selectAll<AnyNode, Element>(selector, [item]).includes(item) ? item : null);
}

/** `attr` of `el`, else of its first descendant `nestedTag` carrying it (e.g. a teaser div → its img src). */
function attrOrNested(el: Element | null, attr: string, nestedTag: string): string | undefined {
  if (!el) return undefined;
  const own = getAttributeValue(el, attr);
  if (own !== undefined) return own;
  const nested = selectOne<AnyNode, Element>(`${nestedTag}[${attr}]`, el);
  return nested ? getAttributeValue(nested, attr) : undefined;
}

export interface ScrapedItem {
  title: string;
  link: string;
  pubDate: string;
  image: string;
  description: string;
}

/** The entries of `html` as described by `scrape`; entries without a title or a link are dropped. */
export function scrapeItems(html: string, pageUrl: string, scrape: NewsScrapeConfig): ScrapedItem[] {
  const doc = parseDocument(html, { decodeEntities: true });
  // script/style/template bodies are not text a reader sees; without this they leak into titles
  for (const el of selectAll<AnyNode, Element>('script, style, noscript, template', doc as unknown as AnyNode)) removeElement(el);
  const items = selectAll<AnyNode, Element>(scrape.item, doc as unknown as AnyNode);
  const out: ScrapedItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const title = clean(textContent(pick(item, scrape.title) ?? []));
    const link = absoluteHttpUrl(attrOrNested(pick(item, scrape.link), 'href', 'a'), pageUrl);
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);
    const dateEl = pick(item, scrape.date);
    const dateText = dateEl ? (getAttributeValue(dateEl, 'datetime') ?? textContent(dateEl)) : '';
    out.push({
      title,
      link,
      pubDate: dateText ? scrapedDateToRfc822(dateText) : '',
      image: absoluteHttpUrl(attrOrNested(pick(item, scrape.image), 'src', 'img'), pageUrl),
      description: clean(textContent(pick(item, scrape.description) ?? [])),
    });
    if (out.length >= SCRAPE_MAX_ITEMS) break;
  }
  return out;
}

/** An RSS 2.0 document for the scraped entries of `html`. */
export function htmlToRss(html: string, pageUrl: string, scrape: NewsScrapeConfig, channelName: string): string {
  const items = scrapeItems(html, pageUrl, scrape).map((i) => {
    const parts = [`<title>${escapeXml(i.title)}</title>`, `<link>${escapeXml(i.link)}</link>`, `<guid isPermaLink="true">${escapeXml(i.link)}</guid>`];
    if (i.pubDate) parts.push(`<pubDate>${i.pubDate}</pubDate>`);
    if (i.description) parts.push(`<description>${escapeXml(i.description)}</description>`);
    if (i.image) parts.push(`<enclosure url="${escapeXml(i.image)}" type="image/jpeg" length="0"/>`);
    return `<item>${parts.join('')}</item>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<rss version="2.0"><channel><title>${escapeXml(channelName)}</title><link>${escapeXml(pageUrl)}</link>` +
    `<description>${escapeXml(channelName)}</description>${items.join('')}</channel></rss>`
  );
}
