import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { absoluteHttpUrl, escapeXml, htmlToRss, isValidScrapeConfig, SCRAPE_MAX_ITEMS, scrapedDateToRfc822, scrapeItems } from './news-scrape';

// trimmed from https://www.swissrowing.ch/de/alle-news (2026-11-08)
const PAGE = `<html><body><div class="view">
<div class="views-row"><article class="node--type-news node--view-mode-teaser">
<a href="/de/news/lucerne-2027-10-rabatt">
<div class="image"><img src="https://www.swissrowing.ch/sites/default/files/styles/teaser/public/a.jpg?h=1&amp;itok=x" alt=""></div>
<div class="head"><span class="category">News</span><span class="date">
  05.11.2026
</span></div>
<h3>Lucerne 2027: 10 % Rabatt auf WM-Tickets &amp; Club Challenge</h3>
<span class="read-more">Weiterlesen</span></a></article></div>
<div class="views-row"><article class="node--type-news node--view-mode-teaser">
<a href="/de/news/baselhead"><div class="head"><span class="date">04.11.2026</span></div>
<h3>BaselHead <script>alert(1)</script>Regatta</h3></a></article></div>
<div class="views-row"><article class="node--type-news"><a href="javascript:alert(1)"><h3>Bad link</h3></a></article></div>
<div class="views-row"><article class="node--type-news"><a href="/de/news/no-title"></a></article></div>
</div></body></html>`;

const SCRAPE = { item: 'article.node--type-news', link: 'a', title: 'h3', date: 'span.date', image: '.image img' };
const BASE = 'https://www.swissrowing.ch/de/alle-news';

describe('isValidScrapeConfig', () => {
  it('needs item, link and title', () => {
    expect(isValidScrapeConfig(SCRAPE)).toBe(true);
    expect(isValidScrapeConfig({ item: 'a', link: 'a' })).toBe(false);
    expect(isValidScrapeConfig({ item: ' ', link: 'a', title: 'h3' })).toBe(false);
    expect(isValidScrapeConfig(undefined)).toBe(false);
  });
  it('accepts empty optional selectors and refuses non-strings or very long ones', () => {
    expect(isValidScrapeConfig({ ...SCRAPE, date: '' })).toBe(true);
    expect(isValidScrapeConfig({ ...SCRAPE, image: 3 })).toBe(false);
    expect(isValidScrapeConfig({ ...SCRAPE, item: 'a'.repeat(201) })).toBe(false);
  });
});

describe('helpers', () => {
  it('escapes XML', () => {
    expect(escapeXml(`a<b>&"'`)).toBe('a&lt;b&gt;&amp;&quot;&apos;');
  });
  it('resolves relative links and drops non-http schemes', () => {
    expect(absoluteHttpUrl('/de/news/x', BASE)).toBe('https://www.swissrowing.ch/de/news/x');
    expect(absoluteHttpUrl('javascript:alert(1)', BASE)).toBe('');
    expect(absoluteHttpUrl('data:text/html,x', BASE)).toBe('');
    expect(absoluteHttpUrl(undefined, BASE)).toBe('');
  });
  it('parses Swiss and ISO dates, and rejects impossible days', () => {
    expect(scrapedDateToRfc822(' 05.11.2026 ')).toBe('Thu, 05 Nov 2026 12:00:00 GMT');
    expect(scrapedDateToRfc822('2026-11-04T08:30:00Z')).toBe('Wed, 04 Nov 2026 08:30:00 GMT');
    expect(scrapedDateToRfc822('31.02.2026')).toBe('');
    expect(scrapedDateToRfc822('05.13.2026')).toBe('');
    expect(scrapedDateToRfc822('05.11.2026 25:00')).toBe('');
    expect(scrapedDateToRfc822('gestern')).toBe('');
  });
});

describe('scrapedDateToRfc822 — time of day is Swiss wall clock', () => {
  it('converts CET (winter) and CEST (summer) to UTC', () => {
    expect(scrapedDateToRfc822('05.11.2026 14:30')).toBe('Thu, 05 Nov 2026 13:30:00 GMT');
    expect(scrapedDateToRfc822('15.07.2026, 14:30')).toBe('Wed, 15 Jul 2026 12:30:00 GMT');
  });
  it('handles the DST switch days', () => {
    expect(scrapedDateToRfc822('29.03.2026 03:30')).toBe('Sun, 29 Mar 2026 01:30:00 GMT');
    expect(scrapedDateToRfc822('25.10.2026 01:30')).toBe('Sat, 24 Oct 2026 23:30:00 GMT');
  });
});

describe('escapeXml — characters XML cannot carry', () => {
  it('drops C0 controls and lone surrogates, keeps tab/newline and real emoji', () => {
    expect(escapeXml('a\u0000b\u001Fc\td\ne')).toBe('abc\td\ne');
    expect(escapeXml('x\uD800y\uDC00z')).toBe('xyz');
    expect(escapeXml('Ruder 🚣')).toBe('Ruder 🚣');
  });
});

describe('scrapeItems', () => {
  it('reads title, absolute link, date and image; drops entries without a usable link or title', () => {
    const items = scrapeItems(PAGE, BASE, SCRAPE);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'Lucerne 2027: 10 % Rabatt auf WM-Tickets & Club Challenge',
      link: 'https://www.swissrowing.ch/de/news/lucerne-2027-10-rabatt',
      pubDate: 'Thu, 05 Nov 2026 12:00:00 GMT',
      image: 'https://www.swissrowing.ch/sites/default/files/styles/teaser/public/a.jpg?h=1&itok=x',
      description: '',
    });
    expect(items[1].image).toBe('');
  });
  it('de-duplicates by link and caps the number of entries', () => {
    const many = Array.from({ length: SCRAPE_MAX_ITEMS + 5 }, (_, i) => `<article class="node--type-news"><a href="/n/${i % (SCRAPE_MAX_ITEMS + 2)}"><h3>T${i}</h3></a></article>`).join('');
    expect(scrapeItems(many, BASE, SCRAPE)).toHaveLength(SCRAPE_MAX_ITEMS);
    const dup = '<article class="node--type-news"><a href="/n/1"><h3>A</h3></a></article>'.repeat(3);
    expect(scrapeItems(dup, BASE, SCRAPE)).toHaveLength(1);
  });
  it('lets the item itself be the link', () => {
    const html = '<a class="teaser" href="/x"><h3>X</h3></a>';
    expect(scrapeItems(html, BASE, { item: 'a.teaser', link: 'a', title: 'h3' })[0].link).toBe('https://www.swissrowing.ch/x');
  });
});

describe('htmlToRss', () => {
  it('produces RSS 2.0 that an XML parser reads back, with text escaped and no markup injected', () => {
    const xml = htmlToRss(PAGE, BASE, SCRAPE, 'Swiss Rowing <News>');
    const doc = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const ch = doc.rss.channel;
    expect(ch.title).toBe('Swiss Rowing <News>');
    expect(ch.item).toHaveLength(2);
    expect(ch.item[0].link).toBe('https://www.swissrowing.ch/de/news/lucerne-2027-10-rabatt');
    expect(ch.item[0].enclosure['@_url']).toContain('/a.jpg?h=1&itok=x');
    expect(ch.item[1].title).toBe('BaselHead Regatta');
    expect(xml).not.toContain('<script');
  });
});
