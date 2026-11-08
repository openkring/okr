// apps/functions/src/news/news-router.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ tenants: ['scs'] }) }) }) }) }),
}));
vi.mock('../_gateway/cache', () => ({
  readCache: vi.fn(async () => null),
  writeCache: vi.fn(async () => undefined),
  isExpired: () => true,
}));
vi.mock('../_gateway/quota', () => ({
  checkWindowQuota: vi.fn(async () => undefined),
  getMonthlyCount: vi.fn(async () => 0),
  incrementMonthlyCount: vi.fn(async () => undefined),
}));

import { NEWS_OPS, NEWS_OPTIONS, newsCenter } from './news-router';
import { newsFeedAdapter } from '../_gateway/adapters/news-feed';
import { newsImageAdapter } from '../_gateway/adapters/news-image';

const auth = { uid: 'u1', token: {} };

describe('newsCenter router', () => {
  const feedFetch = vi.spyOn(newsFeedAdapter, 'fetch').mockResolvedValue({ body: '<rss/>', contentType: 'application/rss+xml', fetchedAt: 'x' });
  const imageFetch = vi.spyOn(newsImageAdapter, 'fetch').mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,', contentType: 'image/jpeg', fetchedAt: 'x' });
  beforeEach(() => {
    feedFetch.mockClear();
    imageFetch.mockClear();
  });

  it('has exactly the three ops', () => {
    expect(Object.keys(NEWS_OPS).sort()).toEqual(['newsFeed', 'newsImage', 'newsResolve']);
  });

  it('uses the relay options: europe-west6, App Check, 256MiB, no secrets', () => {
    expect(NEWS_OPTIONS).toEqual({ cors: true, region: 'europe-west6', enforceAppCheck: true, memory: '256MiB' });
  });

  it('newsFeed dispatches to the feed adapter with the channel key (op stripped)', async () => {
    const res = await newsCenter.run({ auth, app: {}, data: { op: 'newsFeed', channelKey: 'ch1' } } as never);
    expect(feedFetch).toHaveBeenCalledWith({ channelKey: 'ch1' }, expect.objectContaining({ tenantId: 'scs', uid: 'u1' }));
    expect(imageFetch).not.toHaveBeenCalled();
    expect(res).toMatchObject({ data: { body: '<rss/>', contentType: 'application/rss+xml' } });
  });

  it('newsImage dispatches to the image adapter', async () => {
    const res = await newsCenter.run({ auth, app: {}, data: { op: 'newsImage', channelKey: 'cam1' } } as never);
    expect(imageFetch).toHaveBeenCalledTimes(1);
    expect(feedFetch).not.toHaveBeenCalled();
    expect(res).toMatchObject({ data: { dataUrl: 'data:image/jpeg;base64,' } });
  });

  it('newsResolve dispatches to the resolver (which refuses a non-admin)', async () => {
    await expect(newsCenter.run({ auth, app: {}, data: { op: 'newsResolve', url: 'https://x.ch', segment: 'text' } } as never)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('a client-sent tenantId is ignored: the tenant comes from users/{uid}', async () => {
    await newsCenter.run({ auth, app: {}, data: { op: 'newsFeed', channelKey: 'ch1', tenantId: 'other' } } as never);
    expect(feedFetch).toHaveBeenCalledWith({ channelKey: 'ch1' }, expect.objectContaining({ tenantId: 'scs' }));
  });

  it('rejects an unauthenticated caller before any fetch', async () => {
    await expect(newsCenter.run({ app: {}, data: { op: 'newsFeed', channelKey: 'ch1' } } as never)).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(feedFetch).not.toHaveBeenCalled();
  });

  it('an unknown op is invalid-argument', async () => {
    await expect(newsCenter.run({ auth, app: {}, data: { op: 'newsProxy', url: 'https://x' } } as never)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
