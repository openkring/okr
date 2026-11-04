import { describe, expect, it } from 'vitest';
import type { DiarySourceModel } from '@okr/shared-models';

import { buildDiaryRequests } from './list-my-diary-requests';

const doc = (tenantId: string, sources: DiarySourceModel['pulls'][number]['sources'], from = '', to = ''): DiarySourceModel =>
  ({ okey: 'uBka', tenants: ['bka'], authorKey: 'uBka', from, to, pulls: [{ tenantId, sources }] });
const consent = (uid = 'uBka') => [{ tenantId: 'bka', uid, sources: ['tracker' as const] }];
const input = (over: Partial<Parameters<typeof buildDiaryRequests>[0]> = {}) => ({
  ownTenant: 'scs',
  users: [{ id: 'uScs', tenants: ['scs'] }, { id: 'uBka', tenants: ['bka'] }],
  docs: { uBka: doc('scs', ['tracker'], '20261001') },
  consents: [],
  diaryTenants: new Set(['bka']),
  configs: { bka: { appName: 'Bruno Kaiser', logoUrl: 'l.png' } },
  ...over,
});

describe('buildDiaryRequests', () => {
  it('lists a diary asking for this app', () => {
    expect(buildDiaryRequests(input())).toEqual([{ tenantId: 'bka', title: 'Bruno Kaiser', logoUrl: 'l.png', from: '20261001', to: '', requested: ['tracker'], consented: [] }]);
  });
  it('carries what is already allowed', () => {
    expect(buildDiaryRequests(input({ consents: consent() }))[0].consented).toEqual(['tracker']);
  });
  it('still lists a consent the diary no longer asks for, so it can be revoked', () => {
    const r = buildDiaryRequests(input({ docs: { uBka: doc('scs', []) }, consents: consent() }));
    expect(r[0]).toMatchObject({ requested: [], consented: ['tracker'] });
  });
  it('is empty when no diary asks', () => expect(buildDiaryRequests(input({ docs: {} }))).toEqual([]));
  it('skips the diary app itself: it needs no confirmation', () => {
    expect(buildDiaryRequests(input({ ownTenant: 'bka', docs: { uBka: doc('bka', ['taskDone']) } }))).toEqual([]);
  });
  it('skips a tenant without the diary block', () => expect(buildDiaryRequests(input({ diaryTenants: new Set() }))).toEqual([]));
  it('offers no confirmation while two users share the diary tenant', () => {
    const users = [{ id: 'uAdmin', tenants: ['bka'] }, { id: 'uBka', tenants: ['bka'] }];
    expect(buildDiaryRequests(input({ users, docs: { uAdmin: doc('scs', ['tracker']), uBka: doc('scs', ['tracker']) } }))).toEqual([]);
  });
  it('keeps a consent revocable while two users share the diary tenant', () => {
    const users = [{ id: 'uScs', tenants: ['scs'] }, { id: 'uAdmin', tenants: ['bka'] }, { id: 'uBka', tenants: ['bka'] }];
    const r = buildDiaryRequests(input({ users, docs: { uBka: doc('scs', ['tracker']) }, consents: consent() }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tenantId: 'bka', requested: [], consented: ['tracker'] });
  });
  it('offers no confirmation while two users share this app', () => {
    const users = [{ id: 'uScs', tenants: ['scs'] }, { id: 'uScs2', tenants: ['scs'] }, { id: 'uBka', tenants: ['bka'] }];
    expect(buildDiaryRequests(input({ users }))).toEqual([]);
  });
  it('keeps a consent revocable when its diary is gone', () => {
    const r = buildDiaryRequests(input({ users: [{ id: 'uScs', tenants: ['scs'] }], docs: {}, consents: consent() }));
    expect(r[0]).toMatchObject({ tenantId: 'bka', title: 'Bruno Kaiser', requested: [], consented: ['tracker'] });
  });
  it('treats a new account of the diary as a new request', () => {
    expect(buildDiaryRequests(input({ consents: consent('uOld') }))[0]).toMatchObject({ requested: ['tracker'], consented: [] });
  });
  it('skips an archived diary user', () => {
    expect(buildDiaryRequests(input({ users: [{ id: 'uBka', tenants: ['bka'], isArchived: true }] }))).toEqual([]);
  });
});
