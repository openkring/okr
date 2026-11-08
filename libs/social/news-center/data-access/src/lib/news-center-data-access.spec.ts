import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return { ...actual, inject: vi.fn() };
});

const fns = vi.hoisted(() => ({ callable: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('firebase/app', () => ({ getApp: vi.fn(() => 'app') }));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'functions'),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: fns.httpsCallable,
}));

import { inject } from '@angular/core';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { NewsChannelModel, NewsChannelRequestModel, NewsSubscriptionModel } from '@okr/shared-models';

import { NewsChannelRequestService } from './news-channel-request.service';
import { NewsChannelService } from './news-channel.service';
import { NewsRelayService } from './news-relay.service';
import { NewsSubscriptionService } from './news-subscription.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn<R> = (...args: any[]) => R;
const firestore = {
  createModel: vi.fn<AnyFn<Promise<string>>>(async () => 'new-key'),
  updateModel: vi.fn<AnyFn<Promise<string>>>(async () => 'k'),
  updateFields: vi.fn<AnyFn<Promise<string>>>(async () => 'k'),
  readModel: vi.fn<AnyFn<unknown>>(() => of(undefined)),
  readModelOnce: vi.fn<AnyFn<Promise<unknown>>>(async () => undefined),
  searchData: vi.fn<AnyFn<unknown>>(() => of([])),
};

beforeEach(() => {
  vi.clearAllMocks();
  fns.httpsCallable.mockReturnValue(fns.callable);
  vi.mocked(inject).mockImplementation(((token: unknown) => {
    if (token === ENV) return { tenantId: 'scs', useEmulators: false };
    if (token === FirestoreService) return firestore;
    throw new Error('unexpected inject');
  }) as typeof inject);
});

function sub(uid: string): NewsSubscriptionModel {
  const s = new NewsSubscriptionModel();
  s.okey = uid;
  s.hiddenChannelKeys = ['a'];
  return s;
}

describe('NewsSubscriptionService.save', () => {
  it('creates the doc with okey = uid when none exists', async () => {
    firestore.readModelOnce.mockResolvedValueOnce(undefined);
    await new NewsSubscriptionService().save(sub('u1'));
    expect(firestore.readModelOnce).toHaveBeenCalledWith('news-subscriptions', 'u1');
    expect(firestore.createModel).toHaveBeenCalledTimes(1);
    expect(firestore.createModel.mock.calls[0][1].okey).toBe('u1');
    expect(firestore.updateModel).not.toHaveBeenCalled();
  });

  it('updates when the doc exists', async () => {
    firestore.readModelOnce.mockResolvedValueOnce(sub('u1'));
    await new NewsSubscriptionService().save(sub('u1'));
    expect(firestore.updateModel).toHaveBeenCalledTimes(1);
    expect(firestore.createModel).not.toHaveBeenCalled();
  });
});

describe('NewsChannelService', () => {
  it('lists non-archived channels sorted by order', async () => {
    const mk = (okey: string, order: number, isArchived = false) => Object.assign(new NewsChannelModel(), { okey, order, isArchived });
    firestore.searchData.mockReturnValueOnce(of([mk('b', 2), mk('x', 0, true), mk('a', 1)]));
    const list = await firstValueFrom(new NewsChannelService().list('scs'));
    expect(list.map((c) => c.okey)).toEqual(['a', 'b']);
    expect(firestore.searchData.mock.calls[0][1]).toEqual([{ key: 'tenants', operator: 'array-contains', value: 'scs' }]);
  });

  it('archives with a narrow isArchived patch', async () => {
    await new NewsChannelService().archive(Object.assign(new NewsChannelModel(), { okey: 'c1' }));
    expect(firestore.updateFields).toHaveBeenCalledWith('news-channels', 'c1', { isArchived: true });
  });
});

describe('NewsChannelRequestService', () => {
  const req = () => Object.assign(new NewsChannelRequestModel(), { okey: 'r1' });

  it('decide writes only status, decidedAt and channelKey', async () => {
    await new NewsChannelRequestService().decide(req(), 'accepted', 'c9');
    const [collection, key, fields] = firestore.updateFields.mock.calls[0];
    expect(collection).toBe('news-channel-requests');
    expect(key).toBe('r1');
    expect(Object.keys(fields).sort()).toEqual(['channelKey', 'decidedAt', 'status']);
    expect(fields.status).toBe('accepted');
    expect(fields.channelKey).toBe('c9');
    expect(fields.decidedAt).toMatch(/^\d{14}$/);
  });

  it('a rejection leaves channelKey empty', async () => {
    await new NewsChannelRequestService().decide(req(), 'rejected');
    expect(firestore.updateFields.mock.calls[0][2].channelKey).toBe('');
  });

  it('listMine filters on tenant and requester', () => {
    new NewsChannelRequestService().listMine('scs', 'u1');
    expect(firestore.searchData).toHaveBeenCalledWith(
      'news-channel-requests',
      [{ key: 'tenants', operator: 'array-contains', value: 'scs' }, { key: 'requesterUid', operator: '==', value: 'u1' }],
      'createdAt',
      'desc'
    );
  });
});

describe('NewsRelayService', () => {
  it('fetchFeed sends newsFeed and unwraps data.data', async () => {
    fns.callable.mockResolvedValueOnce({ data: { data: { body: '<rss/>', contentType: 'text/xml' }, cached: false } });
    const out = await new NewsRelayService().fetchFeed('c1');
    expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'newsCenter');
    expect(fns.callable).toHaveBeenCalledWith({ op: 'newsFeed', channelKey: 'c1' });
    expect(out).toEqual({ body: '<rss/>', contentType: 'text/xml' });
  });

  it('fetchImage returns the data URL', async () => {
    fns.callable.mockResolvedValueOnce({ data: { data: { dataUrl: 'data:image/png;base64,AA', contentType: 'image/png' } } });
    expect(await new NewsRelayService().fetchImage('c1')).toBe('data:image/png;base64,AA');
    expect(fns.callable).toHaveBeenCalledWith({ op: 'newsImage', channelKey: 'c1' });
  });

  it('resolve returns the plain response and lets errors propagate', async () => {
    const resolved = { kind: 'rss', feedUrl: 'f', siteUrl: 's', name: 'n', avatarUrl: '', body: '', viaRelay: false };
    fns.callable.mockResolvedValueOnce({ data: resolved });
    expect(await new NewsRelayService().resolve('https://x', 'text')).toBe(resolved);
    expect(fns.callable).toHaveBeenCalledWith({ op: 'newsResolve', url: 'https://x', segment: 'text' });
    fns.callable.mockRejectedValueOnce(new Error('not-found'));
    await expect(new NewsRelayService().resolve('https://x', 'text')).rejects.toThrow('not-found');
  });
});
