// apps/functions/src/_gateway/adapters/news-feed.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import type { NewsChannelModel } from '@okr/shared-models';
import { makeNewsFeedAdapter, relayFetch, type NewsRelayDeps } from './news-feed';
import { gatewayFetch } from '../http';
import { BlockedUrlError } from '../ssrf';
import type { GatewayContext } from '../provider';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));

const ctx: GatewayContext = { tenantId: 'scs', uid: 'u1', isAdmin: false };
const publicDns = async () => ['93.184.216.34'];

function channel(patch: Partial<NewsChannelModel> = {}): NewsChannelModel {
  return {
    okey: 'ch1',
    tenants: ['scs'],
    isArchived: false,
    name: 'Club',
    segment: 'text',
    kind: 'rss',
    feedUrl: 'https://feeds.example.com/rss.xml',
    siteUrl: 'https://example.com',
    avatarUrl: '',
    defaultOn: true,
    order: 0,
    refreshMinutes: 5,
    viaRelay: false,
    ...patch,
  } as NewsChannelModel;
}

function deps(ch: NewsChannelModel | undefined, response: Partial<{ data: unknown; headers: Record<string, string>; status: number }> = {}) {
  const fetch = vi.fn(async () => ({ data: '<rss/>', headers: { 'content-type': 'application/rss+xml; charset=utf-8' }, status: 200, ...response }));
  const readChannel = vi.fn(async () => ch);
  const d: Partial<NewsRelayDeps> = { readChannel, fetch: fetch as unknown as NewsRelayDeps['fetch'], lookup: publicDns, now: () => new Date('2026-11-08T10:00:00Z') };
  return { d, fetch, readChannel };
}

describe('newsFeedAdapter — declaration', () => {
  it('is tenant-scoped, authenticated, 300 s TTL, 120 calls per minute', () => {
    const a = makeNewsFeedAdapter({});
    expect(a.id).toBe('news-feed');
    expect(a.scope).toBe('tenant');
    expect(a.ttlSeconds).toBe(300);
    expect(a.requiresAuth).toBe(true);
    expect(a.windowLimit).toEqual({ limit: 120, windowMs: 60_000 });
    expect(a.secrets).toEqual([]);
  });
});

describe('newsFeedAdapter.fetch', () => {
  it('loads the channel and fetches its feedUrl with the relay limits', async () => {
    const { d, fetch, readChannel } = deps(channel());
    const a = makeNewsFeedAdapter(d);
    const raw = await a.fetch({ channelKey: 'ch1' }, ctx);
    expect(readChannel).toHaveBeenCalledWith('ch1');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toBe('https://feeds.example.com/rss.xml');
    expect(opts).toMatchObject({ responseType: 'text', timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, maxRetries: 0, maxRedirects: 3, proxy: false });
    expect(typeof opts['beforeRedirect']).toBe('function');
    expect(typeof opts['lookup']).toBe('function');
    expect(raw).toEqual({ body: '<rss/>', contentType: 'application/rss+xml; charset=utf-8', fetchedAt: '2026-11-08T10:00:00.000Z' });
    expect(a.map(raw, { channelKey: 'ch1' })).toEqual({ body: '<rss/>', contentType: 'application/rss+xml; charset=utf-8' });
    expect(a.sourceTimestamp(raw)).toBe('2026-11-08T10:00:00.000Z');
  });

  it.each([
    ['missing', undefined],
    ['archived', channel({ isArchived: true })],
    ['an image channel', channel({ kind: 'image', segment: 'webcam' })],
    ['in another tenant', channel({ tenants: ['other'] })],
  ])('is not-found when the channel is %s, without fetching', async (_label, ch) => {
    const { d, fetch } = deps(ch);
    await expect(makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx)).rejects.toMatchObject({ code: 'not-found' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'a/b', '..', 'x'.repeat(200), 42])('rejects channelKey %s as invalid-argument before Firestore', async (key) => {
    const { d, readChannel } = deps(channel());
    await expect(makeNewsFeedAdapter(d).fetch({ channelKey: key as string }, ctx)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(readChannel).not.toHaveBeenCalled();
  });

  it('refuses a feed host that resolves to a private address, without fetching', async () => {
    const { d, fetch } = deps(channel());
    d.lookup = async () => ['10.0.0.8'];
    await expect(makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses an http: feedUrl (newsFeed stays https-only)', async () => {
    const { d, fetch } = deps(channel({ feedUrl: 'http://feeds.example.com/rss.xml' }));
    await expect(makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a response that is not XML/RSS/Atom/HTML/JSON', async () => {
    const { d } = deps(channel(), { headers: { 'content-type': 'application/octet-stream' } });
    await expect(makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('turns an upstream error into a plain error without the URL (the gateway logs its message)', async () => {
    const { d, fetch } = deps(channel({ feedUrl: 'https://feeds.example.com/private-token-123.xml' }));
    fetch.mockRejectedValueOnce(Object.assign(new Error('Request failed https://feeds.example.com/private-token-123.xml'), { isAxiosError: true, response: { status: 404 } }));
    const err = await makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('private-token');
  });
});

describe('newsFeedAdapter.fetch — kind html (§7.2)', () => {
  const scrape = { item: 'article', link: 'a', title: 'h3', date: '.date' };
  const page = '<article><a href="/de/news/a"><span class="date">05.11.2026</span><h3>A &amp; B</h3></a></article>';
  const htmlChannel = (patch: Partial<NewsChannelModel> = {}) => channel({ kind: 'html', feedUrl: 'https://www.swissrowing.ch/de/alle-news', scrape, ...patch });

  it('fetches the page and returns RSS built from the scrape selectors, links resolved against the final URL', async () => {
    const { d, fetch } = deps(htmlChannel(), { data: page, headers: { 'content-type': 'text/html; charset=UTF-8' } });
    const raw = await makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx);
    const [, opts] = fetch.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect((opts['headers'] as Record<string, string>)['Accept']).toMatch(/^text\/html/);
    expect(raw.contentType).toBe('application/rss+xml; charset=utf-8');
    expect(raw.body).toContain('<title>Club</title>');
    expect(raw.body).toContain('<item><title>A &amp; B</title><link>https://www.swissrowing.ch/de/news/a</link>');
    expect(raw.body).toContain('<pubDate>Thu, 05 Nov 2026 12:00:00 GMT</pubDate>');
  });

  it.each([
    ['no scrape config', htmlChannel({ scrape: undefined })],
    ['a scrape config without a title selector', htmlChannel({ scrape: { item: 'article', link: 'a', title: '' } })],
  ])('is not-found for an html channel with %s, without fetching', async (_label, ch) => {
    const { d, fetch } = deps(ch);
    await expect(makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx)).rejects.toMatchObject({ code: 'not-found' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a non-HTML response for an html channel', async () => {
    const { d } = deps(htmlChannel(), { data: '<rss/>', headers: { 'content-type': 'application/rss+xml' } });
    await expect(makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('reports an unparseable selector as failed-precondition, not internal', async () => {
    const { d } = deps(htmlChannel({ scrape: { item: 'article[', link: 'a', title: 'h3' } }), { data: page, headers: { 'content-type': 'text/html' } });
    await expect(makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx)).rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'scrape' } });
  });

  it('stays https-only', async () => {
    const { d, fetch } = deps(htmlChannel({ feedUrl: 'http://www.swissrowing.ch/de/alle-news' }));
    await expect(makeNewsFeedAdapter(d).fetch({ channelKey: 'ch1' }, ctx)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('relayFetch — redirect hops', () => {
  async function beforeRedirectOf(opts: Parameters<typeof relayFetch>[1]) {
    const fetch = vi.fn(async () => ({ data: '', headers: {}, status: 200 }));
    await relayFetch('https://feeds.example.com/a', { ...opts, deps: { fetch: fetch as never, lookup: publicDns } });
    const cfg = (fetch.mock.calls[0] as unknown as [string, { beforeRedirect: (o: Record<string, unknown>) => void }])[1];
    return cfg.beforeRedirect;
  }

  it('re-checks every redirect target: private literal, http, non-443 port', async () => {
    const hop = await beforeRedirectOf({ responseType: 'text' });
    expect(() => hop({ href: 'https://10.0.0.1/x' })).toThrow(BlockedUrlError);
    expect(() => hop({ href: 'https://169.254.169.254/latest/meta-data' })).toThrow(BlockedUrlError);
    expect(() => hop({ href: 'http://feeds.example.com/a' })).toThrow(BlockedUrlError);
    expect(() => hop({ href: 'https://feeds.example.com:8443/a' })).toThrow(BlockedUrlError);
    expect(() => hop({ href: 'https://cdn.example.net/a' })).not.toThrow();
  });

  it('builds the hop URL from protocol/host/path when href is missing', async () => {
    const hop = await beforeRedirectOf({ responseType: 'text' });
    expect(() => hop({ protocol: 'https:', host: '127.0.0.1', path: '/' })).toThrow(BlockedUrlError);
  });

  it('with sameHost, a redirect to another host is refused', async () => {
    const hop = await beforeRedirectOf({ responseType: 'arraybuffer', sameHost: true });
    expect(() => hop({ href: 'https://other.example.com/a' })).toThrow(BlockedUrlError);
    expect(() => hop({ href: 'https://feeds.example.com/b' })).not.toThrow();
  });
});

describe('relayFetch — socket-level guard (real axios, local server)', () => {
  it('a host that re-resolves to loopback at connect time never reaches the server (DNS rebinding)', async () => {
    let hits = 0;
    const server = createServer((_req, res) => {
      hits++;
      res.writeHead(200, { 'content-type': 'image/jpeg' }).end('x');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    let calls = 0;
    // first answer (the up-front check) is public, the connect-time answer is loopback
    const rebinding = async () => (calls++ === 0 ? ['93.184.216.34'] : ['127.0.0.1']);
    try {
      const err = await relayFetch(`http://cam.example.com:${port}/snap.jpeg`, {
        responseType: 'arraybuffer',
        allowHttp: true,
        allowAnyPort: true,
        deps: { fetch: gatewayFetch, lookup: rebinding },
      }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'failed-precondition' });
      expect(hits).toBe(0);
      expect(calls).toBe(2);
    } finally {
      server.close();
    }
  });
});
