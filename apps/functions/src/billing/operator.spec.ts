import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('firebase-admin/firestore', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('firebase-admin/firestore');
  return { ...actual, getFirestore: () => h.db };
});

import { getBillingOverview, setTenantBilling, setTenantState } from './operator';
import { optionsFromEnabledBlocks } from './operator.logic';
import { toStoreDate } from '../srv/zurich-time';
import { fakeDb, type Store } from '../credit/testing/credit-fake-db';

const call = (fn: unknown, uid: string, data: unknown = {}) =>
  (fn as { run(r: unknown): Promise<unknown> }).run({ app: {}, auth: { uid, token: {} }, data });
const inv = (over: Record<string, unknown> = {}) => ({
  tenants: ['bkg'], accountingTenantId: 'bkg', receiver: { key: 'scs' }, state: 'pending', isArchived: false, invoiceNo: 1,
  invoiceDate: '20261101', totalAmount: { amount: 5000 }, billingKind: 'subscription', ...over,
});
let store: Store;
beforeEach(() => {
  store = {
    'users/opAdmin': { roles: { admin: true }, tenants: ['bkg'] },
    'users/opTreasurer': { roles: { treasurer: true }, tenants: ['bkg'] },
    'users/opMember': { roles: {}, tenants: ['bkg'] },
    'users/otherAdmin': { roles: { admin: true }, tenants: ['scs'] },
    'app-config/bkg': {}, 'app-config/scs': { enabledFeatures: ['finance', 'expense', 'trip-x'] }, 'app-config/zzz': {},
    'orgs/scs': { name: 'Seeclub' },
    'subscriptions/scs': { billing: 'stripe', state: 'pastDue', currentBand: 'KringS', options: ['buchhaltung'], autopay: true,
      billingFlags: ['vat-blocked'], lastMeasurement: { excludedUsers: 2 } },
    'credit-accounts/scs': { balance: 700 },
    'invoices/i1': inv(), 'invoices/i0': inv({ invoiceDate: '20261001', invoiceNo: 0, state: 'paid', totalAmount: { amount: 100 }, payments: [{ amount: 100, date: '20261002' }] }),
    'payment-attempts/a1': { tenants: ['bkg'], payerTenantId: 'scs', state: 'overpaid', invoiceKey: 'i1' },
    'payment-attempts/a2': { tenants: ['bkg'], payerTenantId: 'scs', state: 'disputed', invoiceKey: 'i1' },
    'payment-attempts/a3': { tenants: ['bkg'], payerTenantId: 'scs', state: 'failed', invoiceKey: 'i1' },
  };
  h.db = fakeDb(store);
});

describe('operator check', () => {
  it('refuses another tenant admin and an operator member', async () => {
    await expect(call(getBillingOverview, 'otherAdmin')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(setTenantBilling, 'otherAdmin', { tenantId: 'zzz', billing: 'stripe' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(setTenantState, 'opMember', { tenantId: 'scs', state: 'active' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('lets the operator treasurer in', async () => {
    expect(Array.isArray(await call(getBillingOverview, 'opTreasurer'))).toBe(true);
  });
});

describe('getBillingOverview', () => {
  it('derives flags, amounts and shows a tenant without subscription as exempt', async () => {
    const rows = (await call(getBillingOverview, 'opAdmin')) as { tenantId: string; [k: string]: unknown }[];
    const scs = rows.find(r => r.tenantId === 'scs') as Record<string, unknown>;
    expect(scs['name']).toBe('Seeclub');
    expect(scs['flags']).toEqual(expect.arrayContaining(['vat-blocked', 'overpaid', 'disputed']));
    expect(scs['lastInvoice']).toEqual({ key: 'i1', no: 1, amount: 5000, state: 'pending' });
    expect(scs['openAmount']).toBe(5000);
    expect(scs['failedAttempts']).toBe(1);
    expect(scs['creditBalance']).toBe(700);
    expect(scs['excludedUsers']).toBe(2);
    expect(rows.find(r => r.tenantId === 'zzz')).toMatchObject({ billing: 'exempt', state: 'active', name: 'zzz', lastInvoice: null });
  });
});

describe('setTenantBilling', () => {
  it('stripe without billingStart defaults to today and initialises options from the enabled paid blocks', async () => {
    const out = (await call(setTenantBilling, 'opAdmin', { tenantId: 'scs', billing: 'stripe' })) as { addedOptions: string[] };
    expect(out.addedOptions.sort()).toEqual(['buchhaltung', 'spesen-ocr']);
    expect(store['subscriptions/scs']).toMatchObject({ billing: 'stripe', billingStart: toStoreDate(new Date()) });
    expect([...(store['subscriptions/scs']['options'] as string[])].sort()).toEqual(['buchhaltung', 'spesen-ocr']);
  });
  it('creates the doc, honours billingStart; exempt leaves options and state', async () => {
    await call(setTenantBilling, 'opAdmin', { tenantId: 'zzz', billing: 'stripe', billingStart: '20261201' });
    expect(store['subscriptions/zzz']).toMatchObject({ billing: 'stripe', billingStart: '20261201' });
    await call(setTenantBilling, 'opAdmin', { tenantId: 'scs', billing: 'exempt' });
    expect(store['subscriptions/scs']).toMatchObject({ billing: 'exempt', state: 'pastDue', options: ['buchhaltung'] });
  });
  it('rejects an unknown tenant', async () => {
    await expect(call(setTenantBilling, 'opAdmin', { tenantId: 'nope', billing: 'stripe' })).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('setTenantState', () => {
  it('reopens and cancels', async () => {
    store['subscriptions/scs']['billingFlags'] = ['vat-blocked', 'run-failed'];
    await call(setTenantState, 'opAdmin', { tenantId: 'scs', state: 'active' });
    expect(store['subscriptions/scs']).toMatchObject({ state: 'active', pastDueSince: '', closingSince: '', billingFlags: ['vat-blocked'] });
    await call(setTenantState, 'opAdmin', { tenantId: 'scs', state: 'cancelled' });
    expect(store['subscriptions/scs']).toMatchObject({ state: 'cancelled', cancelledAt: toStoreDate(new Date()) });
  });
});

describe('optionsFromEnabledBlocks', () => {
  it('legacy (undefined) adds every mapped option', () => {
    expect(optionsFromEnabledBlocks(undefined)).toEqual(expect.arrayContaining(['buchhaltung', 'crm', 'logbuch']));
    expect(optionsFromEnabledBlocks(undefined)).not.toContain('shop');
  });
});
