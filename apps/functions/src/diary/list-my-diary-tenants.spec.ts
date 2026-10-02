import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS } from '@okr/tenant-util';
import { buildDiaryTenantList } from './list-my-diary-tenants';

const rollouts = [{ okey: 'diary', availability: 'beta', allowTenants: ['bka', 'jp'] }] as never[];

describe('buildDiaryTenantList', () => {
  const configs = {
    scs: { enabledFeatures: ['task', 'jasstafel'], appName: 'Seeclub', logoUrl: 's.png' },
    bka: { enabledFeatures: ['diary', 'task'], appName: 'Bruno', logoUrl: 'b.png' },
    jp:  { enabledFeatures: ['diary'], appName: 'Japan 2026', logoUrl: '', travelFrom: '20261001', travelTo: '20261020' },
    off: { enabledFeatures: ['diary'], appName: 'Off' },   // diary not rolled out to 'off'
  };
  const base = { configs, rollouts, catalogue: FEATURE_BLOCKS };

  it('lists the login tenants with an effective diary, including the caller tenant', () => {
    const r = buildDiaryTenantList({ ...base, loginTenants: ['bka', 'jp', 'off', 'scs'], callerTenant: 'bka' });
    expect(r.diaries.map(d => d.tenantId)).toEqual(['bka', 'jp']);
    expect(r.diaries[1]).toEqual({ tenantId: 'jp', title: 'Japan 2026', logoUrl: '', travelFrom: '20261001', travelTo: '20261020' });
  });
  it('offers the sources of the caller tenant', () => {
    const r = buildDiaryTenantList({ ...base, loginTenants: ['bka', 'scs'], callerTenant: 'scs' });
    expect(r.sources).toEqual(['taskDone', 'jasstafel']);
  });
  it('falls back to the tenant id as title and coalesces a legacy config', () => {
    const r = buildDiaryTenantList({ ...base, configs: { bka: { enabledFeatures: ['diary'] } }, loginTenants: ['bka'], callerTenant: 'bka' });
    expect(r.diaries[0]).toEqual({ tenantId: 'bka', title: 'bka', logoUrl: '', travelFrom: '', travelTo: '' });
  });
  it('returns no diaries for a tenant without config', () => {
    const r = buildDiaryTenantList({ ...base, configs: {}, loginTenants: ['bka'], callerTenant: 'scs' });
    expect(r.diaries).toEqual([]);
  });
});
