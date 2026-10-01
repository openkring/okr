import { describe, expect, it } from 'vitest';
import { isActiveLeafCostCenter, isProfitAndLossAccountId, resolveCostCenterKey, CostCenterLike } from './cost-center.util';

const cc = (okey: string, parentKey = '', extra: Partial<CostCenterLike> = {}): CostCenterLike =>
  ({ okey, parentKey, accountingTenantId: 'scs', isArchived: false, ...extra });
// 300 Sport (group) → 310 Junioren (leaf), 320 Regatta (leaf); 400 archived leaf; 900 gss leaf
const centers = [cc('300'), cc('310', '300'), cc('320', '300'), cc('400', '', { isArchived: true }), cc('900', '', { accountingTenantId: 'gss' })];
const expense = { id: '6300', costCenterKey: '320', accountingTenantId: 'scs' };

describe('isProfitAndLossAccountId', () => {
  it('is true for classes 3-9 and false for balance-sheet and empty ids', () => {
    expect(['3000', '4400', '6300', '9200'].map(isProfitAndLossAccountId)).toEqual([true, true, true, true]);
    expect(['1020', '2000', '', undefined].map(isProfitAndLossAccountId)).toEqual([false, false, false, false]);
  });
});

describe('isActiveLeafCostCenter', () => {
  it('accepts an active leaf of the same accounting tenant', () => expect(isActiveLeafCostCenter('310', 'scs', centers)).toBe(true));
  it('rejects a group', () => expect(isActiveLeafCostCenter('300', 'scs', centers)).toBe(false));
  it('rejects an archived leaf', () => expect(isActiveLeafCostCenter('400', 'scs', centers)).toBe(false));
  it('rejects a foreign accounting tenant', () => expect(isActiveLeafCostCenter('900', 'scs', centers)).toBe(false));
  it('rejects an unknown or empty key', () => {
    expect(isActiveLeafCostCenter('nope', 'scs', centers)).toBe(false);
    expect(isActiveLeafCostCenter('', 'scs', centers)).toBe(false);
  });
});

describe('resolveCostCenterKey', () => {
  it('prefers explicit > source > rule > account default', () => {
    expect(resolveCostCenterKey({ explicit: '310', source: '320', rule: '320', account: expense, costCenters: centers })).toBe('310');
    expect(resolveCostCenterKey({ source: '310', rule: '320', account: expense, costCenters: centers })).toBe('310');
    expect(resolveCostCenterKey({ rule: '310', account: expense, costCenters: centers })).toBe('310');
    expect(resolveCostCenterKey({ account: expense, costCenters: centers })).toBe('320');
  });
  it('skips invalid candidates and falls through', () => {
    expect(resolveCostCenterKey({ explicit: '300', source: '400', rule: '900', account: expense, costCenters: centers })).toBe('320');
  });
  it('returns empty when nothing is valid', () => {
    expect(resolveCostCenterKey({ rule: '400', account: { ...expense, costCenterKey: '' }, costCenters: centers })).toBe('');
  });
  it('returns empty for a balance-sheet account whatever the inputs', () => {
    expect(resolveCostCenterKey({ explicit: '310', account: { id: '1020', costCenterKey: '310', accountingTenantId: 'scs' }, costCenters: centers })).toBe('');
  });
  it('returns empty for an unknown account', () => {
    expect(resolveCostCenterKey({ explicit: '310', account: undefined, costCenters: centers })).toBe('');
  });
});
