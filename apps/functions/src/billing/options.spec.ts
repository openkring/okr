import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ db: undefined as unknown, failCommit: false }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => h.db }));

import { createSetSubscriptionOptions, paidOptionChanges, setBillingEmail } from './options';
import { createApplyFeatureSelection } from '../tenant/apply-feature-selection';
import { fakeDb as baseFakeDb, type Store } from '../credit/testing/credit-fake-db';
import { FEATURE_BLOCKS, type FeatureBlock } from '@okr/tenant-util';
import { ADD_ON_BLOCKS } from '@okr/business-metering-util';

const block = (id: string, over: Partial<FeatureBlock> = {}): FeatureBlock => ({
  id, bundle: 'special', label: `@f.${id}`, icon: 'help-circle', defaultAvailability: 'ga',
  dependsOn: [], menu: [], collections: [], ...over,
});
const CATALOGUE = [
  block('person'), block('buchhaltung', { dependsOn: ['person'] }), block('calevent'),
  block('reports', { dependsOn: ['buchhaltung'] }),
];
// stubbed option -> blocks mapping (the real ADD_ON_BLOCKS is pinned against FEATURE_BLOCKS below)
const MAP = { buchhaltung: ['buchhaltung'], crm: [] as string[] };

/** fakeDb has no WriteBatch (commitChunked needs one) and no `parent` on refs: add both. */
const withBatch = (store: Store): unknown => {
  const db = baseFakeDb(store) as unknown as Record<string, unknown>;
  db['batch'] = () => {
    const ops: (() => Promise<void>)[] = [];
    return { set: (ref: { set(d: unknown, o?: unknown): Promise<void> }, d: unknown, o?: unknown) => { ops.push(() => ref.set(d, o)); }, commit: async () => { if (h.failCommit) throw new Error('commit failed'); for (const op of ops) await op(); } };
  };
  return db;
};
const fakeDb = withBatch;
let current: Store = {};
const seed = (billing: 'stripe' | 'exempt' | null, options: string[] = [], enabled: string[] = []) => {
  const store: Record<string, Record<string, unknown>> = {
    'users/u1': { roles: { admin: true }, tenants: ['scs'] },
    'app-config/scs': { enabledFeatures: enabled },
  };
  if (billing) store['subscriptions/scs'] = { billing, options, billingEmail: '' };
  return store;
};
const req = (data: unknown) => ({ app: {}, auth: { uid: 'u1', token: {} }, data }) as never;

describe('ADD_ON_BLOCKS against the real catalogue (finance split, 2026-11-10)', () => {
  it('maps every option to existing, non-core blocks, one option per block', () => {
    const byId = new Map(FEATURE_BLOCKS.map(b => [b.id, b]));
    const blocks = Object.values(ADD_ON_BLOCKS).flat();
    blocks.forEach(id => {
      expect(byId.has(id), id).toBe(true);
      expect(byId.get(id)?.core, id).toBeFalsy();
    });
    expect(new Set(blocks).size).toBe(blocks.length);
  });

  it('fences the split blocks by their own option: enabling expense needs spesen-ocr, not buchhaltung', () => {
    expect(paidOptionChanges(['finance'], ['finance', 'expense'], ['buchhaltung'])).toEqual(['spesen-ocr']);
    expect(paidOptionChanges(['finance'], ['finance', 'expense'], ['buchhaltung', 'spesen-ocr'])).toEqual([]);
  });
});

describe('paidOptionChanges', () => {
  it('lists newly enabled paid ids that are not allowed', () => {
    expect(paidOptionChanges([], ['buchhaltung', 'calevent'], [], MAP)).toEqual(['buchhaltung']);
  });
  it('allows subscribed, already-enabled and non-paid ids', () => {
    expect(paidOptionChanges([], ['buchhaltung'], ['buchhaltung'], MAP)).toEqual([]);
    expect(paidOptionChanges(['buchhaltung'], ['buchhaltung'], [], MAP)).toEqual([]);
    expect(paidOptionChanges([], ['calevent', 'toString'], [], MAP)).toEqual([]);
  });
});

describe('fence in applyFeatureSelection', () => {
  const call = (store: Record<string, Record<string, unknown>>) => {
    current = store; h.db = fakeDb(store);
    return createApplyFeatureSelection(CATALOGUE, MAP).run(req({
      tenantId: 'scs', intent: { verb: 'enableBlock', blockId: 'buchhaltung', menuKeys: [] },
    }));
  };
  it('refuses a stripe tenant enabling an unsubscribed paid block', async () => {
    await expect(call(seed('stripe'))).rejects.toMatchObject({
      code: 'failed-precondition', details: { reason: 'option-not-subscribed', ids: ['buchhaltung'] },
    });
  });
  it('lets a stripe tenant enable a subscribed one', async () => {
    await expect(call(seed('stripe', ['buchhaltung']))).resolves.toMatchObject({ applied: true });
  });
  it('leaves an exempt tenant and a tenant without subscription unchanged', async () => {
    await expect(call(seed('exempt'))).resolves.toMatchObject({ applied: true });
    await expect(call(seed(null))).resolves.toMatchObject({ applied: true });
  });
});

const setSubscriptionOptions = createSetSubscriptionOptions(CATALOGUE, MAP);

describe('setSubscriptionOptions', () => {
  beforeEach(() => { h.db = undefined; h.failCommit = false; });
  const call = (store: Record<string, Record<string, unknown>>, options: unknown) => {
    current = store; h.db = fakeDb(store);
    return setSubscriptionOptions.run(req({ options }));
  };

  it('writes options and enables the block with its dependency', async () => {
    const store = seed('stripe');
    const res = await call(store, ['buchhaltung']);
    expect(res).toEqual({ options: ['buchhaltung'] });
    expect(current['subscriptions/scs']['options']).toEqual(['buchhaltung']);
    const enabled = current['app-config/scs']['enabledFeatures'] as string[];
    expect(enabled).toEqual(expect.arrayContaining(['buchhaltung', 'person']));
  });
  it('disables a removed option', async () => {
    const store = seed('stripe', ['buchhaltung'], ['buchhaltung', 'person']);
    await call(store, []);
    const s = current;
    expect(s['subscriptions/scs']['options']).toEqual([]);
    expect(s['app-config/scs']['enabledFeatures']).toEqual(['person']);
  });
  it('refuses an option that has no catalogue block yet', async () => {
    await expect(call(seed('stripe'), ['crm'])).rejects.toMatchObject({
      code: 'failed-precondition', message: 'option-not-available', details: { ids: ['crm'] },
    });
    expect(current['subscriptions/scs']['options']).toEqual([]);
  });
  it('a failing enable leaves the options written; a retry enables and keeps them', async () => {
    const store = seed('stripe');
    h.failCommit = true;
    await expect(call(store, ['buchhaltung'])).rejects.toThrow('commit failed');
    expect(current['subscriptions/scs']['options']).toEqual(['buchhaltung']);
    expect(current['app-config/scs']['enabledFeatures']).toEqual([]);
    h.failCommit = false;
    await call(store, ['buchhaltung']);
    expect(current['subscriptions/scs']['options']).toEqual(['buchhaltung']);
    expect(current['app-config/scs']['enabledFeatures']).toEqual(expect.arrayContaining(['buchhaltung', 'person']));
  });
  it('a refused disable leaves the options unchanged', async () => {
    const store = seed('stripe', ['buchhaltung'], ['buchhaltung', 'person', 'reports']);
    await expect(call(store, [])).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(current['subscriptions/scs']['options']).toEqual(['buchhaltung']);
  });
  it('rejects an unknown id', async () => {
    await expect(call(seed('stripe'), ['nope'])).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('rejects a non-array', async () => {
    await expect(call(seed('stripe'), 'buchhaltung')).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('refuses an exempt tenant', async () => {
    await expect(call(seed('exempt'), ['buchhaltung'])).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('not-billed-by-stripe') });
  });
  it.each(['closed', 'cancelled'])('refuses a %s subscription and writes nothing', async (state) => {
    const store = seed('stripe', ['buchhaltung'], ['buchhaltung', 'person']);
    store['subscriptions/scs']['state'] = state;
    await expect(call(store, [])).rejects.toMatchObject({
      code: 'failed-precondition', message: 'subscription-not-active', details: { reason: 'subscription-not-active', state },
    });
    expect(current['subscriptions/scs']['options']).toEqual(['buchhaltung']);
    expect(current['app-config/scs']['enabledFeatures']).toEqual(['buchhaltung', 'person']);
  });
  it.each(['active', 'pastDue', 'closing', undefined])('accepts state %s (missing = active)', async (state) => {
    const store = seed('stripe');
    if (state) store['subscriptions/scs']['state'] = state;
    await expect(call(store, ['buchhaltung'])).resolves.toEqual({ options: ['buchhaltung'] });
  });
  it('refuses a non-admin', async () => {
    const store = seed('stripe');
    store['users/u1'] = { roles: {}, tenants: ['scs'] };
    await expect(call(store, ['buchhaltung'])).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('setBillingEmail', () => {
  const call = (store: Record<string, Record<string, unknown>>, email: unknown) => {
    current = store; h.db = fakeDb(store);
    return setBillingEmail.run(req({ email }));
  };
  it('rejects an invalid address', async () => {
    await expect(call(seed('stripe'), 'not-an-email')).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('stores a valid address on an existing subscription', async () => {
    await call(seed('stripe'), ' kasse@club.ch ');
    expect(current['subscriptions/scs']['billingEmail']).toBe('kasse@club.ch');
  });
  it('creates the subscription doc when missing', async () => {
    await call(seed(null), 'kasse@club.ch');
    const sub = current['subscriptions/scs'];
    expect(sub['billingEmail']).toBe('kasse@club.ch');
    expect(sub['billing']).toBe('exempt');
  });
});
