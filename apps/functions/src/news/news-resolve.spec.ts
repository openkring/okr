// apps/functions/src/news/news-resolve.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { alternateFeedUrl, detectNewsKind, makeNewsResolve, segmentAccepts, youtubeChannelId } from './news-resolve';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));

const fixture = (name: string) => readFileSync(join(__dirname, '../_gateway/adapters/fixtures/news', name), 'utf8');
const UC = 'UCa1b2c3d4e5f6g7h8i9j0kA';
const YT_FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${UC}`;

type Route = { body: string | Buffer; contentType: string; status?: number };
const imageHead = JSON.parse(fixture('image-head.json')) as { headers: Record<string, string> };

const ROUTES: Record<string, Route> = {
  'https://www.youtube.com/@segelclub': { body: fixture('youtube-channel.html'), contentType: 'text/html; charset=utf-8' },
  [`https://www.youtube.com/channel/${UC}`]: { body: fixture('youtube-channel.html'), contentType: 'text/html; charset=utf-8' },
  'https://www.youtube.com/c/segelclub': { body: fixture('youtube-channel.html'), contentType: 'text/html; charset=utf-8' },
  'https://www.youtube.com/user/segelclub': { body: fixture('youtube-channel.html'), contentType: 'text/html; charset=utf-8' },
  [YT_FEED]: { body: fixture('youtube-feed.xml'), contentType: 'text/xml; charset=UTF-8' },
  'https://vimeo.com/bootswerftmuster': { body: fixture('vimeo-user.html'), contentType: 'text/html' },
  'https://vimeo.com/bootswerftmuster/videos/rss': { body: fixture('vimeo-feed.xml'), contentType: 'application/rss+xml' },
  'https://www.example-club.ch/feed.xml': { body: fixture('rss.xml'), contentType: 'application/rss+xml; charset=utf-8' },
  'https://podcast.example.org/feed': { body: fixture('podcast.xml'), contentType: 'application/xml' },
  'https://blog.example.ch/blog/': { body: fixture('html-with-alternate.html'), contentType: 'text/html' },
  'https://blog.example.ch/blog/atom.xml': { body: fixture('atom.xml'), contentType: 'application/atom+xml' },
  'https://plain.example.ch/': { body: fixture('plain.html'), contentType: 'text/html' },
  'https://cam.example.ch/live.jpg': { body: Buffer.from([0xff, 0xd8]), contentType: imageHead.headers['content-type'] },
  'http://scstaefa.example.org:8080/snap.jpeg': { body: Buffer.from([0xff, 0xd8]), contentType: 'image/jpeg' },
  'http://http-feed.example.ch/rss': { body: fixture('rss.xml'), contentType: 'application/rss+xml' },
  'https://gone.example.ch/': { body: '', contentType: 'text/html', status: 404 },
};

function setup(lookup: (h: string) => Promise<string[]> = async () => ['93.184.216.34']) {
  const fetch = vi.fn(async (url: string) => {
    const r = ROUTES[url];
    if (!r || (r.status ?? 200) >= 400) {
      throw Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status: r?.status ?? 404 } });
    }
    return { data: Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body, 'utf8'), headers: { 'content-type': r.contentType }, status: 200 };
  });
  const handler = makeNewsResolve({ fetch: fetch as never, lookup });
  const call = (data: unknown, token: Record<string, unknown> = { admin: true }) =>
    handler({ auth: { uid: 'u1', token }, data } as never);
  return { fetch, call };
}

describe('newsResolve — authorization and input', () => {
  it('refuses a caller without admin/contentAdmin before any fetch', async () => {
    const { fetch, call } = setup();
    await expect(call({ url: 'https://www.example-club.ch/feed.xml', segment: 'text' }, {})).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call({ url: 'https://www.example-club.ch/feed.xml', segment: 'text' }, { privileged: true })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts contentAdmin', async () => {
    const { call } = setup();
    await expect(call({ url: 'https://www.example-club.ch/feed.xml', segment: 'text' }, { contentAdmin: true })).resolves.toMatchObject({ kind: 'rss' });
  });

  it('refuses an unauthenticated caller', async () => {
    const handler = makeNewsResolve({ fetch: vi.fn() as never });
    await expect(handler({ data: { url: 'https://x.ch', segment: 'text' } } as never)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it.each([
    [{ url: 'https://x.ch/feed', segment: 'cinema' }],
    [{ url: '', segment: 'text' }],
    [{ url: 42, segment: 'text' }],
    [{ url: 'https://x.ch/' + 'a'.repeat(2100), segment: 'text' }],
    [{ url: 'ftp://x.ch/feed', segment: 'text' }],
  ])('rejects %j as invalid-argument', async (data) => {
    const { fetch, call } = setup();
    await expect(call(data)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a host that resolves to a private address, without fetching', async () => {
    const { fetch, call } = setup(async () => ['169.254.169.254']);
    await expect(call({ url: 'https://www.example-club.ch/feed.xml', segment: 'text' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('newsResolve — YouTube (RF)', () => {
  it.each([
    'https://www.youtube.com/@segelclub',
    `https://www.youtube.com/channel/${UC}`,
    'https://www.youtube.com/c/segelclub',
    'https://www.youtube.com/user/segelclub',
    'https://m.youtube.com/@segelclub?si=abc123',
    'youtube.com/@segelclub',
  ])('%s → the channel feed', async (url) => {
    const { call } = setup();
    const res = await call({ url, segment: 'video' });
    expect(res).toMatchObject({
      kind: 'youtube',
      feedUrl: YT_FEED,
      siteUrl: `https://www.youtube.com/channel/${UC}`,
      name: 'Segelclub Beispiel',
      avatarUrl: 'https://yt3.googleusercontent.com/abc=s900-c-k-c0x00ffffff-no-rj',
      viaRelay: false,
    });
    expect((res as { body: string }).body).toContain('<feed');
  });

  it.each(['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ'])(
    '%s (a video, not a channel) → not-found «no-feed», never a 500',
    async (url) => {
      const { call } = setup();
      await expect(call({ url, segment: 'video' })).rejects.toMatchObject({ code: 'not-found', details: { reason: 'no-feed' } });
    },
  );
});

describe('newsResolve — other sources', () => {
  it('a Vimeo user page → its RSS, kind vimeo', async () => {
    const { call } = setup();
    await expect(call({ url: 'https://vimeo.com/bootswerftmuster', segment: 'video' })).resolves.toMatchObject({
      kind: 'vimeo',
      feedUrl: 'https://vimeo.com/bootswerftmuster/videos/rss',
      siteUrl: 'https://vimeo.com/bootswerftmuster/videos',
      name: 'Bootswerft Muster videos',
      avatarUrl: 'https://i.vimeocdn.com/portrait/123_300x300.jpg',
    });
  });

  it('an RSS feed without audio → rss, name from channel/title (CDATA, entities)', async () => {
    const { call } = setup();
    await expect(call({ url: 'https://www.example-club.ch/feed.xml', segment: 'text' })).resolves.toMatchObject({
      kind: 'rss',
      feedUrl: 'https://www.example-club.ch/feed.xml',
      siteUrl: 'https://www.example-club.ch/news',
      name: 'Seeclub News & Berichte',
      avatarUrl: '',
    });
  });

  it('an RSS feed with an audio enclosure → podcast, avatar from itunes:image', async () => {
    const { call } = setup();
    await expect(call({ url: 'https://podcast.example.org/feed', segment: 'audio' })).resolves.toMatchObject({
      kind: 'podcast',
      name: 'Rudern im Ohr',
      avatarUrl: 'https://podcast.example.org/cover.jpg',
      siteUrl: 'https://podcast.example.org/',
    });
  });

  it('an HTML page with <link rel="alternate"> → that (relative) feed', async () => {
    const { call } = setup();
    await expect(call({ url: 'https://blog.example.ch/blog/', segment: 'text' })).resolves.toMatchObject({
      kind: 'rss',
      feedUrl: 'https://blog.example.ch/blog/atom.xml',
      siteUrl: 'https://blog.example.ch/blog/',
      name: 'Club-Blog',
      avatarUrl: 'https://blog.example.ch/logo.png',
    });
  });

  it('an https image → image with an empty body, loaded directly', async () => {
    const { call } = setup();
    await expect(call({ url: 'https://cam.example.ch/live.jpg', segment: 'webcam' })).resolves.toMatchObject({
      kind: 'image',
      feedUrl: 'https://cam.example.ch/live.jpg',
      body: '',
      viaRelay: false,
    });
  });

  it('an http: image on port 8080 → image with viaRelay', async () => {
    const { call } = setup();
    await expect(call({ url: 'http://scstaefa.example.org:8080/snap.jpeg', segment: 'webcam' })).resolves.toMatchObject({
      kind: 'image',
      feedUrl: 'http://scstaefa.example.org:8080/snap.jpeg',
      body: '',
      viaRelay: true,
    });
  });

  it('an http: URL that is not an image → invalid-argument', async () => {
    const { call } = setup();
    await expect(call({ url: 'http://http-feed.example.ch/rss', segment: 'text' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('a page without any feed, and a 404, → not-found «no-feed»', async () => {
    const { call } = setup();
    await expect(call({ url: 'https://plain.example.ch/', segment: 'text' })).rejects.toMatchObject({ code: 'not-found', details: { reason: 'no-feed' } });
    await expect(call({ url: 'https://gone.example.ch/', segment: 'text' })).rejects.toMatchObject({ code: 'not-found', details: { reason: 'no-feed' } });
  });

  it('a kind the segment does not take → invalid-argument', async () => {
    const { call } = setup();
    await expect(call({ url: 'https://podcast.example.org/feed', segment: 'video' })).rejects.toMatchObject({ code: 'invalid-argument', details: { reason: 'segment' } });
    await expect(call({ url: 'https://cam.example.ch/live.jpg', segment: 'text' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('pure helpers', () => {
  it('detectNewsKind', () => {
    expect(detectNewsKind('application/rss+xml', fixture('rss.xml'))).toBe('rss');
    expect(detectNewsKind('application/xml', fixture('podcast.xml'))).toBe('podcast');
    expect(detectNewsKind('text/html', fixture('rss.xml'))).toBe('rss'); // sniffed body wins over a wrong header
    expect(detectNewsKind('application/atom+xml', fixture('atom.xml'))).toBe('rss');
    expect(detectNewsKind('text/xml', fixture('youtube-feed.xml'))).toBe('youtube');
    expect(detectNewsKind('image/jpeg', '')).toBe('image');
    expect(detectNewsKind('text/html', fixture('plain.html'))).toBe('html');
    expect(detectNewsKind('application/octet-stream', 'garbage')).toBeUndefined();
  });

  it('youtubeChannelId prefers the page’s own id over ids of recommended channels', () => {
    expect(youtubeChannelId(fixture('youtube-channel.html'))).toBe(UC);
    expect(youtubeChannelId('<script>{"channelId":"UCbbbbbbbbbbbbbbbbbbbbbb"}</script>')).toBe('UCbbbbbbbbbbbbbbbbbbbbbb');
    expect(youtubeChannelId('<html></html>')).toBeUndefined();
  });

  it('alternateFeedUrl resolves relative hrefs, any attribute order and case', () => {
    expect(alternateFeedUrl(fixture('html-with-alternate.html'), 'https://blog.example.ch/blog/')).toBe('https://blog.example.ch/blog/atom.xml');
    expect(alternateFeedUrl(fixture('plain.html'), 'https://plain.example.ch/')).toBeUndefined();
    expect(alternateFeedUrl('<link rel="alternate" type="application/rss+xml" href="/f?a=1&amp;b=2">', 'https://x.ch/p')).toBe('https://x.ch/f?a=1&b=2');
  });

  it('segmentAccepts', () => {
    expect(segmentAccepts('video', 'youtube')).toBe(true);
    expect(segmentAccepts('video', 'vimeo')).toBe(true);
    expect(segmentAccepts('video', 'rss')).toBe(false);
    expect(segmentAccepts('audio', 'podcast')).toBe(true);
    expect(segmentAccepts('audio', 'rss')).toBe(false);
    expect(segmentAccepts('text', 'rss')).toBe(true);
    expect(segmentAccepts('text', 'podcast')).toBe(false);
    expect(segmentAccepts('webcam', 'image')).toBe(true);
    expect(segmentAccepts('webcam', 'rss')).toBe(false);
  });
});
