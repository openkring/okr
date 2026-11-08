import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NewsChannelModel } from '@okr/shared-models';
import { NewsFeedParseError, parseDuration, parseNewsFeed, toPlainText, webcamItem } from './news-feed.parser';

const fx = (name: string): string => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const youtubeXml = fx('youtube.xml');
const podcastXml = fx('podcast.xml');
const rss2Xml = fx('rss2.xml');
const atomXml = fx('atom.xml');
const notXml = fx('not-xml.html');

describe('parseNewsFeed', () => {
  it('parses a YouTube Atom feed', () => {
    const items = parseNewsFeed(youtubeXml, 'youtube', 'c1');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'dQw4w9WgXcQ',
      channelKey: 'c1',
      title: 'Regatta auf dem Zürichsee',
      mediaUrl: 'dQw4w9WgXcQ',
      link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnailUrl: expect.stringContaining('ytimg.com'),
      publishedAt: expect.stringMatching(/^\d{4}-/),
    });
  });

  it('drops a hostile yt:videoId from mediaUrl', () => {
    for (const bad of ['x/../evil', 'a?b=1', 'a#b', 'a&quot;b', '']) {
      const xml = youtubeXml.replace('<yt:videoId>dQw4w9WgXcQ</yt:videoId>', `<yt:videoId>${bad}</yt:videoId>`);
      expect(parseNewsFeed(xml, 'youtube', 'c1')[0].mediaUrl, bad).toBeUndefined();
    }
  });

  it('reads podcast enclosure, itunes:image and itunes:duration', () => {
    const [ep, ep2] = parseNewsFeed(podcastXml, 'podcast', 'p1');
    expect(ep.mediaUrl).toMatch(/\.mp3/);
    expect(ep.durationSec).toBe(3130);
    expect(ep.thumbnailUrl).toBe('https://example.org/ep12.jpg');
    expect(ep2.durationSec).toBe(1800);
    expect(ep2.thumbnailUrl).toBeUndefined();
  });

  it('takes media:thumbnail, else image enclosure, else first <img> of the description (rss2)', () => {
    const items = parseNewsFeed(rss2Xml, 'rss', 'r1');
    expect(items[0].thumbnailUrl).toBe('https://example.org/img/steg-thumb.jpg');
    expect(items[1].thumbnailUrl).toBe('https://example.org/img/gv.png');
    expect(items[2].thumbnailUrl).toBe('https://example.org/img/bootshaus.jpg');
  });

  it('reads an Atom feed (media:thumbnail, else first <img> of the content)', () => {
    const items = parseNewsFeed(atomXml, 'rss', 'a1');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'Saisonstart', link: 'https://example.org/blog/saisonstart', thumbnailUrl: 'https://example.org/img/saison.jpg' });
    expect(items[0].publishedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(items[1].thumbnailUrl).toBe('https://example.org/img/fest.jpg');
    expect(items[1].publishedAt).toBe('2026-10-15T08:00:00.000Z');
  });

  it('strips HTML from summaries and never returns markup', () => {
    for (const [xml, kind] of [[rss2Xml, 'rss'], [atomXml, 'rss'], [podcastXml, 'podcast']] as const) {
      expect(parseNewsFeed(xml, kind, 'x').every((i) => !/[<>]/.test(i.summary ?? ''))).toBe(true);
    }
    expect(parseNewsFeed(rss2Xml, 'rss', 'r1')[0].summary).toContain('Der neue Steg ist offen.');
  });

  it('caps at max items', () => {
    expect(parseNewsFeed(rss2Xml, 'rss', 'r1', 2)).toHaveLength(2);
  });

  it('throws NewsFeedParseError for an HTML page', () => {
    expect(() => parseNewsFeed(notXml, 'rss', 'x')).toThrow(NewsFeedParseError);
  });

  it('throws NewsFeedParseError for well-formed XML with a foreign root', () => {
    expect(() => parseNewsFeed('<html><body/></html>', 'rss', 'x')).toThrow(NewsFeedParseError);
  });

  it('returns [] for a feed without items and keeps undated items with publishedAt ""', () => {
    expect(parseNewsFeed('<rss version="2.0"><channel><title>t</title></channel></rss>', 'rss', 'x')).toEqual([]);
    const items = parseNewsFeed(rss2Xml, 'rss', 'r1');
    expect(items[2].publishedAt).toBe('');
    expect(items[0].publishedAt).toBe('2026-11-02T08:00:00.000Z');
  });

  it('gives items a stable id even without a guid', () => {
    const items = parseNewsFeed(rss2Xml, 'rss', 'r1');
    expect(items.every((i) => i.id.length > 0)).toBe(true);
    expect(items[0].id).toBe('https://example.org/news/steg');
  });
});

describe('parseDuration', () => {
  it('parses HH:MM:SS, MM:SS and plain seconds', () => {
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('52:10')).toBe(3130);
    expect(parseDuration('1800')).toBe(1800);
  });
  it('returns undefined for junk or empty', () => {
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration(null)).toBeUndefined();
    expect(parseDuration('abc')).toBeUndefined();
  });
});

describe('toPlainText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(toPlainText('<p>Hallo   <b>Welt</b></p>\n<p>zwei</p>')).toBe('Hallo Welt zwei');
  });
  it('never executes or returns script', () => {
    expect(toPlainText('<img src=x onerror=alert(1)>ok')).toBe('ok');
  });
  it('handles null and undefined', () => {
    expect(toPlainText(null)).toBe('');
    expect(toPlainText(undefined)).toBe('');
  });
});

describe('webcamItem', () => {
  const ch = Object.assign(new NewsChannelModel(), { okey: 'w1', name: 'Seeblick', kind: 'image' as const, feedUrl: 'https://cam.example.org/live.jpg' });
  it('appends a cache-buster with ? or &', () => {
    expect(webcamItem(ch, 1000).mediaUrl).toBe('https://cam.example.org/live.jpg?t=1000');
    expect(webcamItem({ ...ch, feedUrl: 'https://cam.example.org/live.jpg?x=1' }, 2000).mediaUrl).toBe('https://cam.example.org/live.jpg?x=1&t=2000');
  });
  it('maps channel fields', () => {
    expect(webcamItem(ch, 1000)).toMatchObject({ channelKey: 'w1', title: 'Seeblick', thumbnailUrl: 'https://cam.example.org/live.jpg?t=1000' });
  });
});
