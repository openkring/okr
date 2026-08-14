import { describe, expect, it } from 'vitest';

import { CH_KMU_ACCOUNTS, buildChartOfAccounts, getSeededAccountKey } from './chart-of-accounts';

describe('chart of accounts', () => {
  const accounts = buildChartOfAccounts('tenant-1', 'org-1');
  const byId = (id: string) => accounts.find(a => a.id === id);

  it('has unique, stable okeys and one root', () => {
    expect(new Set(accounts.map(a => a.okey)).size).toBe(accounts.length);
    expect(accounts.filter(a => a.type === 'root')).toHaveLength(1);
    expect(byId('1000')?.okey).toBe(getSeededAccountKey('org-1', '1000'));
  });

  it('references an existing parent for every account', () => {
    const keys = new Set(accounts.map(a => a.okey));
    for (const account of accounts.filter(a => a.type !== 'root')) {
      expect(keys.has(account.parentKey)).toBe(true);
    }
  });

  it('marks parents as group and everything else as leaf', () => {
    expect(byId('100')?.type).toBe('group');   // parent of 1000/1020
    expect(byId('1000')?.type).toBe('leaf');
    expect(byId('1000')?.parentKey).toBe(byId('100')?.okey);
  });

  it('carries the tenant and the accounting tenant', () => {
    expect(accounts.every(a => a.tenants[0] === 'tenant-1')).toBe(true);
    expect(accounts.every(a => a.accountingTenantId === 'org-1')).toBe(true);
    expect(accounts).toHaveLength(CH_KMU_ACCOUNTS.length + 1);
  });

  it('contains the accounts the VAT codes link to', () => {
    expect(byId('2200')?.name).toContain('Umsatzsteuer');
    expect(byId('1170')?.name).toContain('Vorsteuer');
  });
});
