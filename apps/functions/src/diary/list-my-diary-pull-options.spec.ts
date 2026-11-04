import { describe, expect, it } from 'vitest';

import { buildDiaryPullOptions } from './list-my-diary-pull-options';

const input = (over: Partial<Parameters<typeof buildDiaryPullOptions>[0]> = {}) => ({
  ownTenant: 'bka',
  uid: 'uBka',
  users: [{ id: 'uBka', tenants: ['bka'] }, { id: 'uScs', tenants: ['scs'], diaryConsents: [{ tenantId: 'bka', uid: 'uBka', sources: ['tracker' as const] }] }, { id: 'uOkr', tenants: ['okr'] }],
  loginTenants: ['bka', 'okr', 'scs'],
  configs: {
    bka: { appName: 'Bruno', enabledFeatures: ['diary', 'task'] },
    scs: { appName: 'Seeclub', logoUrl: 's.png', enabledFeatures: ['trip', 'task'] },
    okr: { enabledFeatures: ['cms'] },
  },
  rollouts: [{ okey: 'diary', availability: 'beta', allowTenants: ['bka'] }] as never[],
  ...over,
});

describe('buildDiaryPullOptions', () => {
  it('lists the diary app first, then the apps with something to offer', () => {
    expect(buildDiaryPullOptions(input())).toEqual([
      { tenantId: 'bka', title: 'Bruno', logoUrl: '', sources: ['taskDone'], consented: [], own: true },
      { tenantId: 'scs', title: 'Seeclub', logoUrl: 's.png', sources: ['taskDone', 'tracker'], consented: ['tracker'], own: false },
    ]);
  });
  it('does not show a consent given to another account as confirmed', () => {
    expect(buildDiaryPullOptions(input({ uid: 'uNew' })).find((c) => c.tenantId === 'scs')?.consented).toEqual([]);
  });
  it('offers nothing in an app without a diary', () => expect(buildDiaryPullOptions(input({ ownTenant: 'scs' }))).toEqual([]));
  it('does not offer tracker from the diary app itself: its recordings are there already', () => {
    const configs = { bka: { enabledFeatures: ['diary', 'trip', 'task'] }, scs: { enabledFeatures: ['trip'] } };
    const columns = buildDiaryPullOptions(input({ configs, loginTenants: ['bka', 'scs'] }));
    expect(columns.find((c) => c.tenantId === 'bka')?.sources).toEqual(['taskDone']);
    expect(columns.find((c) => c.tenantId === 'scs')?.sources).toContain('tracker');
  });
  it('leaves out an app the person cannot log in to', () => {
    expect(buildDiaryPullOptions(input({ loginTenants: ['bka'] })).map((c) => c.tenantId)).toEqual(['bka']);
  });
});
