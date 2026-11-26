import { describe, expect, it } from 'vitest';
import {
  buildChooserEntries,
  PORTAL_TENANTS_KEY,
  readSavedTenants,
  removeSavedTenant,
  SavedTenant,
  touchSavedTenant,
} from './portal.util';
import { TenantConfigMeta } from './tenant-switcher.util';

const mem = (initial?: string) => {
  const data: Record<string, string> = initial === undefined ? {} : { [PORTAL_TENANTS_KEY]: initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = v; },
  };
};
const configs = (...ids: string[]) =>
  new Map<string, TenantConfigMeta>(ids.map((id) => [id, { appName: id.toUpperCase(), logoUrl: `tenant/${id}/logo` }]));

describe('readSavedTenants', () => {
  it('survives broken JSON', () => expect(readSavedTenants(mem('{nope'))).toEqual([]));
  it('survives missing storage', () => expect(readSavedTenants(undefined)).toEqual([]));
  it('survives a throwing storage', () =>
    expect(readSavedTenants({ getItem: () => { throw new Error('blocked'); } })).toEqual([]));
  it('drops invalid ids and malformed rows', () => {
    const raw = JSON.stringify([{ tenantId: 'scs', lastUsed: 2 }, { tenantId: '../x', lastUsed: 3 }, { tenantId: 'p13' }, 'kring']);
    expect(readSavedTenants(mem(raw))).toEqual([{ tenantId: 'scs', lastUsed: 2 }]);
  });
});

describe('touchSavedTenant', () => {
  it('adds a tenant at the front', () => {
    const s = mem(JSON.stringify([{ tenantId: 'scs', lastUsed: 1 }]));
    touchSavedTenant(s, 'p13', 5);
    expect(readSavedTenants(s)).toEqual([{ tenantId: 'p13', lastUsed: 5 }, { tenantId: 'scs', lastUsed: 1 }]);
  });

  it('moves an existing tenant to the front', () => {
    const s = mem(JSON.stringify([{ tenantId: 'scs', lastUsed: 1 }, { tenantId: 'p13', lastUsed: 2 }]));
    touchSavedTenant(s, 'scs', 9);
    expect(readSavedTenants(s).map((t) => t.tenantId)).toEqual(['scs', 'p13']);
  });

  it('caps the list at 50', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ tenantId: `t${i}x`, lastUsed: i }));
    const s = mem(JSON.stringify(many));
    touchSavedTenant(s, 'scs', 100);
    const after = readSavedTenants(s);
    expect(after).toHaveLength(50);
    expect(after[0].tenantId).toBe('scs');
  });

  it('ignores an invalid id', () => {
    const s = mem();
    touchSavedTenant(s, '../x', 1);
    expect(readSavedTenants(s)).toEqual([]);
  });
});

describe('removeSavedTenant', () => {
  it('removes the tenant', () => {
    const s = mem(JSON.stringify([{ tenantId: 'scs', lastUsed: 1 }, { tenantId: 'p13', lastUsed: 2 }]));
    removeSavedTenant(s, 'scs');
    expect(readSavedTenants(s).map((t) => t.tenantId)).toEqual(['p13']);
  });
});

describe('buildChooserEntries', () => {
  const saved: SavedTenant[] = [{ tenantId: 'scs', lastUsed: 1 }, { tenantId: 'p13', lastUsed: 9 }];

  it('orders saved by last use, then login tenants, then listed tenants by name', () => {
    const entries = buildChooserEntries(saved, ['bka', 'scs'], ['sc7', 'elab', 'p13'], configs('scs', 'p13', 'bka', 'sc7', 'elab'));
    expect(entries.map((e) => [e.tenantId, e.source])).toEqual([
      ['p13', 'saved'], ['scs', 'saved'], ['bka', 'login'], ['elab', 'listed'], ['sc7', 'listed'],
    ]);
  });

  it('takes name and logo from the config', () => {
    const [entry] = buildChooserEntries([{ tenantId: 'scs', lastUsed: 1 }], [], [], configs('scs'));
    expect(entry).toEqual({ tenantId: 'scs', name: 'SCS', logoUrl: 'tenant/scs/logo', source: 'saved' });
  });

  it('falls back to the tenant id when the config has no name', () => {
    const [entry] = buildChooserEntries([], ['kwa'], [], new Map([['kwa', {}]]));
    expect(entry.name).toBe('kwa');
  });

  it('drops tenants without config', () =>
    expect(buildChooserEntries(saved, ['gone'], ['alsogone'], configs('scs')).map((e) => e.tenantId)).toEqual(['scs']));
});
