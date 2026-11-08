import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return { ...actual, inject: vi.fn() };
});

import { inject } from '@angular/core';

import { NewsChannelModel, NewsChannelRequestModel, NewsSubscriptionModel } from '@okr/shared-models';
import { NewsChannelRequestService, NewsChannelService, NewsRelayService, NewsSubscriptionService } from '@okr/social-news-center-data-access';

import { emptySubscription, NewsCenterService, NewsFeedState, NEWS_REFETCH_MS, staleChannels, toResolveError } from './news-center.service';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
  <item><title>One</title><link>https://x.ch/1</link><guid>1</guid><pubDate>Sat, 07 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const relay = { fetchFeed: vi.fn(), fetchImage: vi.fn(), resolve: vi.fn() };
const subscriptions = { save: vi.fn(async () => undefined), read: vi.fn() };
const channelsSvc = { create: vi.fn(async () => 'new-channel'), update: vi.fn(async () => 'k'), archive: vi.fn(), list: vi.fn() };
const requests = { create: vi.fn<(req: NewsChannelRequestModel) => Promise<string>>(async () => 'req-key'), decide: vi.fn(async () => undefined), listOpen: vi.fn(), listMine: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(inject).mockImplementation(((token: unknown) => {
    if (token === NewsRelayService) return relay;
    if (token === NewsSubscriptionService) return subscriptions;
    if (token === NewsChannelService) return channelsSvc;
    if (token === NewsChannelRequestService) return requests;
    throw new Error('unexpected inject');
  }) as typeof inject);
});

function channel(okey: string, patch: Partial<NewsChannelModel> = {}): NewsChannelModel {
  return Object.assign(new NewsChannelModel(), { okey, name: okey, tenants: ['scs'] }, patch);
}

function feed(fetchedAt: number, patch: Partial<NewsFeedState> = {}): NewsFeedState {
  return { items: [], loading: false, error: false, fetchedAt, ...patch };
}

describe('NewsCenterService.loadChannels', () => {
  it('a rejected fetchFeed marks only that channel failed', async () => {
    relay.fetchFeed.mockImplementation(async (key: string) => {
      if (key === 'bad') throw Object.assign(new Error('boom'), { code: 'functions/not-found' });
      return { body: RSS, contentType: 'application/rss+xml' };
    });
    const results: Record<string, NewsFeedState> = {};
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await new NewsCenterService().loadChannels([channel('a'), channel('bad'), channel('c')], (k, s) => (results[k] = s), 4, () => 1000);

    expect(results['bad']).toEqual({ items: [], loading: false, error: true, fetchedAt: 1000 });
    expect(results['a'].error).toBe(false);
    expect(results['a'].items.map((i) => i.title)).toEqual(['One']);
    expect(results['c'].error).toBe(false);
  });

  it('an unparsable feed marks only that channel failed', async () => {
    relay.fetchFeed.mockImplementation(async (key: string) => ({ body: key === 'html' ? '<html><body>nope</body></html>' : RSS, contentType: 'text/html' }));
    const results: Record<string, NewsFeedState> = {};
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await new NewsCenterService().loadChannels([channel('html'), channel('ok')], (k, s) => (results[k] = s));

    expect(results['html'].error).toBe(true);
    expect(results['ok'].error).toBe(false);
  });

  it('keeps at most four requests in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    relay.fetchFeed.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { body: RSS, contentType: 'application/rss+xml' };
    });
    const loaded: string[] = [];

    await new NewsCenterService().loadChannels(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => channel(k)), (k) => loaded.push(k));

    expect(peak).toBe(4);
    expect(loaded).toHaveLength(9);
  });

  it('a direct webcam is not fetched; a viaRelay webcam gets its image from the relay', async () => {
    relay.fetchImage.mockResolvedValue('data:image/jpeg;base64,AAAA');
    const results: Record<string, NewsFeedState> = {};
    const direct = channel('cam', { kind: 'image', segment: 'webcam', feedUrl: 'https://cam.ch/snap.jpg' });
    const relayed = channel('relayed', { kind: 'image', segment: 'webcam', feedUrl: 'http://cam.ch:8080/snap.jpg', viaRelay: true });

    await new NewsCenterService().loadChannels([direct, relayed], (k, s) => (results[k] = s), 4, () => 5000);

    expect(relay.fetchFeed).not.toHaveBeenCalled();
    expect(relay.fetchImage).toHaveBeenCalledWith('relayed');
    expect(results['cam'].items[0].mediaUrl).toBe('https://cam.ch/snap.jpg?t=5000');
    expect(results['relayed'].items[0].mediaUrl).toBe('data:image/jpeg;base64,AAAA');
  });
});

describe('staleChannels (refetch on setSegment)', () => {
  const now = 100 * 60_000;

  it('does not refetch a feed loaded within the last 10 minutes', () => {
    expect(staleChannels([channel('a')], { a: feed(now - NEWS_REFETCH_MS + 1) }, now)).toEqual([]);
  });

  it('refetches a feed older than 10 minutes, and one never loaded', () => {
    const result = staleChannels([channel('a'), channel('b')], { a: feed(now - NEWS_REFETCH_MS) }, now);
    expect(result.map((c) => c.okey)).toEqual(['a', 'b']);
  });

  it('force refetches fresh feeds, but never one that is loading', () => {
    const result = staleChannels([channel('a'), channel('b')], { a: feed(now), b: feed(0, { loading: true }) }, now, true);
    expect(result.map((c) => c.okey)).toEqual(['a']);
  });

  it('a webcam is stale after its refreshMinutes', () => {
    const cam = channel('cam', { kind: 'image', refreshMinutes: 2 });
    expect(staleChannels([cam], { cam: feed(now - 60_000) }, now)).toEqual([]);
    expect(staleChannels([cam], { cam: feed(now - 2 * 60_000) }, now)).toEqual([cam]);
  });
});

describe('NewsCenterService subscription changes', () => {
  it('hide writes hiddenChannelKeys for a default channel', async () => {
    const sub = emptySubscription('u1', 'scs');

    await new NewsCenterService().hide(sub, channel('a', { defaultOn: true }));

    expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ okey: 'u1', tenants: ['scs'], hiddenChannelKeys: ['a'] }));
  });

  it('hide of an added channel takes it off addedChannelKeys', async () => {
    const sub: NewsSubscriptionModel = { ...emptySubscription('u1', 'scs'), addedChannelKeys: ['x', 'y'] };

    await new NewsCenterService().hide(sub, channel('x', { defaultOn: false }));

    expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ hiddenChannelKeys: [], addedChannelKeys: ['y'] }));
  });

  it('show and add change only their own list, without duplicates', async () => {
    const sub: NewsSubscriptionModel = { ...emptySubscription('u1', 'scs'), hiddenChannelKeys: ['a'], addedChannelKeys: ['b'] };
    const service = new NewsCenterService();

    await service.show(sub, 'a');
    await service.add(sub, 'b');

    expect(subscriptions.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ hiddenChannelKeys: [], addedChannelKeys: ['b'] }));
    expect(subscriptions.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ hiddenChannelKeys: ['a'], addedChannelKeys: ['b'] }));
  });
});

describe('NewsCenterService suggestions and club list', () => {
  it('suggest creates an open request with createdAt, requester and tenant', async () => {
    await new NewsCenterService().suggest({ segment: 'audio', url: 'https://pod.ch/feed', note: 'gut' }, { uid: 'u1', name: 'Anna Muster', tenantId: 'scs' });

    const req = requests.create.mock.calls[0][0];
    expect(req).toMatchObject({
      tenants: ['scs'], segment: 'audio', url: 'https://pod.ch/feed', note: 'gut', requesterUid: 'u1', requesterName: 'Anna Muster',
      status: 'open', decidedAt: '', channelKey: '',
    });
    expect(req.createdAt).toMatch(/^\d{14}$/);
  });

  it('accepts a request only after its channel was saved, with the new key', async () => {
    const req = Object.assign(new NewsChannelRequestModel(), { okey: 'r1' });

    expect(await new NewsCenterService().acceptAfterSave(req, Promise.resolve('ch1'))).toBe(true);

    expect(requests.decide).toHaveBeenCalledWith(req, 'accepted', 'ch1');
  });

  it('does not accept when the channel save failed', async () => {
    const req = Object.assign(new NewsChannelRequestModel(), { okey: 'r1' });
    const service = new NewsCenterService();

    expect(await service.acceptAfterSave(req, Promise.resolve(undefined))).toBe(false);
    expect(await service.acceptAfterSave(req, Promise.reject(new Error('denied')))).toBe(false);

    expect(requests.decide).not.toHaveBeenCalled();
  });

  it('a new channel gets the tenant and the next order of its segment', async () => {
    const all = [channel('a', { segment: 'video', order: 0 }), channel('b', { segment: 'video', order: 3 }), channel('c', { segment: 'audio', order: 9 })];
    const fresh = channel('', { segment: 'video', tenants: [] });

    expect(await new NewsCenterService().saveChannel(fresh, 'scs', all)).toBe('new-channel');

    expect(channelsSvc.create).toHaveBeenCalledWith(expect.objectContaining({ tenants: ['scs'], order: 4 }));
  });

  it('reorder writes only the channels whose position changed', async () => {
    const all = [channel('a', { order: 0 }), channel('b', { order: 1 }), channel('c', { order: 2 })];

    await new NewsCenterService().reorder(all, ['a', 'c', 'b']);

    expect(channelsSvc.update).toHaveBeenCalledTimes(2);
    expect(channelsSvc.update).toHaveBeenCalledWith(expect.objectContaining({ okey: 'c', order: 1 }));
    expect(channelsSvc.update).toHaveBeenCalledWith(expect.objectContaining({ okey: 'b', order: 2 }));
  });
});

describe('toResolveError', () => {
  it('maps the relay reason, permission-denied and anything else', () => {
    expect(toResolveError({ code: 'functions/not-found', details: { reason: 'no-feed' } })).toBe('no-feed');
    expect(toResolveError({ code: 'functions/invalid-argument', details: { reason: 'segment', kind: 'image' } })).toBe('segment');
    expect(toResolveError({ code: 'functions/permission-denied' })).toBe('permission-denied');
    expect(toResolveError({ code: 'functions/internal', details: { reason: 'weird' } })).toBe('unknown');
    expect(toResolveError(undefined)).toBe('unknown');
  });
});
