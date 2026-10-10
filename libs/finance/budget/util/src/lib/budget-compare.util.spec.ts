import { describe, expect, it } from 'vitest';

import { BudgetVersionModel } from '@okr/shared-models';

import { defaultCompareVersion, usedPercent } from './budget-compare.util';

describe('usedPercent', () => {
  it('is undefined without a budget and rounds to a whole percent', () => {
    expect(usedPercent(500, 0)).toBeUndefined();
    expect(usedPercent(1000, 1300)).toBe(77);
    expect(usedPercent(-500, -1000)).toBe(50);
  });
});

describe('defaultCompareVersion', () => {
  const v = (okey: string, status: 'draft' | 'approved' | 'superseded', extra: Partial<BudgetVersionModel> = {}): BudgetVersionModel =>
    ({ ...new BudgetVersionModel('scs', 'scs', 2027), okey, status, ...extra });

  it('prefers the newest approved budget', () => {
    const versions = [v('d1', 'draft'), v('a1', 'approved', { approvedAt: '20261101' }), v('a2', 'approved', { approvedAt: '20261201' })];
    expect(defaultCompareVersion(versions, 2027)?.okey).toBe('a2');
  });

  it('falls back to the last draft, ignores archived and other years', () => {
    const versions = [v('d1', 'draft'), v('d2', 'draft'), v('d3', 'draft', { isArchived: true }), v('d4', 'draft', { fiscalYear: 2028 })];
    expect(defaultCompareVersion(versions, 2027)?.okey).toBe('d2');
    expect(defaultCompareVersion(versions, 2029)).toBeUndefined();
  });
});
