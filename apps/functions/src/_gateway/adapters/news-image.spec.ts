// apps/functions/src/_gateway/adapters/news-image.spec.ts
import { describe, it, expect, vi } from 'vitest';
import type { NewsChannelModel } from '@okr/shared-models';
import { makeNewsImageAdapter } from './news-image';
import type { NewsRelayDeps } from './news-feed';
import type { GatewayContext } from '../provider';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));

const ctx: GatewayContext = { tenantId: 'scs', uid: 'u1', isAdmin: false };

function cam(patch: Partial<NewsChannelModel> = {}): NewsChannelModel {
  return {
    okey: 'cam1', tenants: ['scs'], isArchived: false, name: 'Hafen', segment: 'webcam', kind: 'image',
    feedUrl: 'http://scstaefa.example.org:8080/snap.jpeg', siteUrl: '', avatarUrl: '', defaultOn: true, order: 0,
    refreshMinutes: 5, viaRelay: true, ...patch,
  } as NewsChannelModel;
}

function deps(ch: NewsChannelModel | undefined, contentType = 'image/jpeg', lookup = async () => ['93.184.216.34']) {
  const fetch = vi.fn(async () => ({ data: Buffer.from([0xff, 0xd8, 0xff]), headers: { 'content-type': contentType }, status: 200 }));
  const d: Partial<NewsRelayDeps> = { readChannel: async () => ch, fetch: fetch as unknown as NewsRelayDeps['fetch'], lookup, now: () => new Date('2026-11-08T10:00:00Z') };
  return { d, fetch };
}

describe('newsImageAdapter', () => {
  it('is tenant-scoped with a 60 s TTL', () => {
    const a = makeNewsImageAdapter({});
    expect(a.id).toBe('news-image');
    expect(a.scope).toBe('tenant');
    expect(a.ttlSeconds).toBe(60);
    expect(a.requiresAuth).toBe(true);
  });

  it('fetches an http: camera on an explicit port and returns a data URL', async () => {
    const { d, fetch } = deps(cam());
    const a = makeNewsImageAdapter(d);
    const raw = await a.fetch({ channelKey: 'cam1' }, ctx);
    const [url, opts] = fetch.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toBe('http://scstaefa.example.org:8080/snap.jpeg');
    expect(opts).toMatchObject({ responseType: 'arraybuffer', timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, maxRetries: 0 });
    expect(a.map(raw, { channelKey: 'cam1' })).toEqual({ dataUrl: 'data:image/jpeg;base64,/9j/', contentType: 'image/jpeg' });
  });

  it('refuses a redirect to another host', async () => {
    const { d, fetch } = deps(cam());
    await makeNewsImageAdapter(d).fetch({ channelKey: 'cam1' }, ctx);
    const hop = (fetch.mock.calls[0] as unknown as [string, { beforeRedirect: (o: Record<string, unknown>) => void }])[1].beforeRedirect;
    expect(() => hop({ href: 'http://elsewhere.example.org:8080/snap.jpeg' })).toThrow();
    expect(() => hop({ href: 'http://scstaefa.example.org:8080/other.jpeg' })).not.toThrow();
    expect(() => hop({ href: 'http://192.168.1.1:8080/snap.jpeg' })).toThrow();
  });

  it.each([
    ['missing', undefined],
    ['archived', cam({ isArchived: true })],
    ['in another tenant', cam({ tenants: ['other'] })],
    ['not an image channel', cam({ kind: 'rss', segment: 'text' })],
    ['an http: camera without viaRelay', cam({ viaRelay: false })],
    ['an https: camera without viaRelay', cam({ viaRelay: false, feedUrl: 'https://cam.example.org/snap.jpg' })],
  ])('is not-found when the channel is %s, without fetching', async (_l, ch) => {
    const { d, fetch } = deps(ch);
    await expect(makeNewsImageAdapter(d).fetch({ channelKey: 'cam1' }, ctx)).rejects.toMatchObject({ code: 'not-found' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a camera host that resolves to a private address', async () => {
    const { d, fetch } = deps(cam(), 'image/jpeg', async () => ['192.168.1.20']);
    await expect(makeNewsImageAdapter(d).fetch({ channelKey: 'cam1' }, ctx)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['text/html', 'image/svg+xml', 'image/gif', ''])('refuses content type %j', async (ct) => {
    const { d } = deps(cam(), ct);
    await expect(makeNewsImageAdapter(d).fetch({ channelKey: 'cam1' }, ctx)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('accepts png and webp, ignoring parameters and case', async () => {
    for (const [ct, expected] of [['image/PNG', 'image/png'], ['image/webp; q=1', 'image/webp']]) {
      const { d } = deps(cam(), ct);
      const a = makeNewsImageAdapter(d);
      const raw = await a.fetch({ channelKey: 'cam1' }, ctx);
      expect(a.map(raw, { channelKey: 'cam1' }).contentType).toBe(expected);
    }
  });
});
