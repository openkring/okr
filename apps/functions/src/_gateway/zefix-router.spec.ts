import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ tenants: ['scs'] }) }) }) }) }),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin', () => ({ firestore: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: (n: string) => ({ name: n, value: () => 'x' }) }));
vi.mock('./cache', () => ({
  readCache: vi.fn(async () => null),
  writeCache: vi.fn(async () => undefined),
  isExpired: () => true,
  invalidateProvider: vi.fn(),
}));
vi.mock('./quota', () => ({
  checkWindowQuota: vi.fn(async () => undefined),
  getMonthlyCount: vi.fn(async () => 0),
  incrementMonthlyCount: vi.fn(async () => undefined),
}));

import { ZEFIX_OPS, ZEFIX_OPTIONS, zefix } from './zefix-router';
import { zefixDetailsAdapter, zefixSearchAdapter } from './adapters/zefix';

const auth = { uid: 'u1', token: {} };

describe('zefix op table', () => {
  const searchFetch = vi.spyOn(zefixSearchAdapter, 'fetch').mockResolvedValue({ list: [] } as never);
  const detailsFetch = vi.spyOn(zefixDetailsAdapter, 'fetch').mockResolvedValue({} as never);
  beforeEach(() => {
    searchFetch.mockClear();
    detailsFetch.mockClear();
  });

  it('has exactly the 2 op names as keys', () => {
    expect(Object.keys(ZEFIX_OPS).sort()).toEqual(['zefixGetByUid', 'zefixSearch']);
  });

  it('uses the router options from the consolidation spec', () => {
    expect(ZEFIX_OPTIONS).toEqual({ cors: true, region: 'europe-west6', enforceAppCheck: true, secrets: expect.any(Array) });
    expect(ZEFIX_OPTIONS.secrets.map((s: { name: string }) => s.name)).toEqual(['ZEFIX_UID', 'ZEFIX_PWD']);
  });

  it('both adapters declare the same secrets as the router', () => {
    expect(zefixDetailsAdapter.secrets).toEqual(ZEFIX_OPTIONS.secrets);
    expect(zefixSearchAdapter.secrets).toEqual(ZEFIX_OPTIONS.secrets);
  });

  for (const name of ['zefixSearch', 'zefixGetByUid']) {
    it(`${name}: rejects an unauthenticated caller before any upstream call`, async () => {
      await expect(zefix.run({ app: {}, data: { op: name, name: 'x' } } as never)).rejects.toMatchObject({ code: 'unauthenticated' });
      expect(searchFetch).not.toHaveBeenCalled();
      expect(detailsFetch).not.toHaveBeenCalled();
    });
  }

  it('zefixSearch runs the search adapter', async () => {
    await ZEFIX_OPS['zefixSearch']({ auth, data: { name: 'Acme' } } as never);
    expect(searchFetch).toHaveBeenCalledTimes(1);
    expect(detailsFetch).not.toHaveBeenCalled();
  });

  it('zefixGetByUid runs the details adapter', async () => {
    await ZEFIX_OPS['zefixGetByUid']({ auth, data: { uid: 'CHE-1' } } as never);
    expect(detailsFetch).toHaveBeenCalledTimes(1);
    expect(searchFetch).not.toHaveBeenCalled();
  });

  it('an unknown op is invalid-argument', async () => {
    await expect(zefix.run({ auth, app: {}, data: { op: 'nope' } } as never)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
