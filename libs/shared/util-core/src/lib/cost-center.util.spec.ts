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
  it('rejects a childless group or root (type set and not leaf)', () => {
    const typed = [cc('500', '', { type: 'group' }), cc('600', '', { type: 'root' }), cc('700', '', { type: 'leaf' })];
    expect(isActiveLeafCostCenter('500', 'scs', typed)).toBe(false);
    expect(isActiveLeafCostCenter('600', 'scs', typed)).toBe(false);
    expect(isActiveLeafCostCenter('700', 'scs', typed)).toBe(true);
  });
  it('accepts a childless node without a type field', () => expect(isActiveLeafCostCenter('320', 'scs', centers)).toBe(true));
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

  describe('book default (accounting-wide fallback)', () => {
    const noDefault = { ...expense, costCenterKey: '' };
    it('applies the book default when the account has none', () => {
      expect(resolveCostCenterKey({ account: noDefault, bookDefault: '310', costCenters: centers })).toBe('310');
    });
    it('lets the account default win over the book default', () => {
      expect(resolveCostCenterKey({ account: expense, bookDefault: '310', costCenters: centers })).toBe('320');
    });
    it('lets explicit, source and rule win over the book default', () => {
      expect(resolveCostCenterKey({ explicit: '320', account: noDefault, bookDefault: '310', costCenters: centers })).toBe('320');
      expect(resolveCostCenterKey({ source: '320', account: noDefault, bookDefault: '310', costCenters: centers })).toBe('320');
      expect(resolveCostCenterKey({ rule: '320', account: noDefault, bookDefault: '310', costCenters: centers })).toBe('320');
    });
    it('drops an invalid book default (archived, group, foreign tenant)', () => {
      for (const bookDefault of ['400', '300', '900', 'nope']) {
        expect(resolveCostCenterKey({ account: noDefault, bookDefault, costCenters: centers })).toBe('');
      }
    });
    it('falls back to the book default when the account default is invalid', () => {
      expect(resolveCostCenterKey({ account: { ...expense, costCenterKey: '400' }, bookDefault: '310', costCenters: centers })).toBe('310');
    });
    it('ignores the book default on a balance-sheet account', () => {
      expect(resolveCostCenterKey({ account: { id: '1020', costCenterKey: '', accountingTenantId: 'scs' }, bookDefault: '310', costCenters: centers })).toBe('');
    });
    it('returns empty for an empty book default', () => {
      expect(resolveCostCenterKey({ account: noDefault, bookDefault: '', costCenters: centers })).toBe('');
    });
  });
});
