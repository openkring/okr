import { describe, expect, it } from 'vitest';

import { CostAllocationModel, MoneyModel } from '@okr/shared-models';

import { applyAllocations } from './cost-allocation.util';
import { CostCenterRollUp } from './cost-center-aggregate';

const rule = (okey: string, extra: Partial<CostAllocationModel>): CostAllocationModel =>
  ({ ...new CostAllocationModel('scs', 'scs', 2026), okey, title: `R ${okey}`, ...extra });
const t = (budget: number, actual: number) => ({ budget, actual, compare: 0 });
const rollUp = new Map<string, CostCenterRollUp>([
  ['club', { expense: t(10000, 8000), revenue: t(0, 0) }],
  ['jun', { expense: t(0, 0), revenue: t(0, 0) }],
  ['sport', { expense: t(5000, 4000), revenue: t(0, 0) }],
]);
const sel = (...keys: string[]) => new Set(keys);

describe('applyAllocations', () => {
  const pct = rule('p', { fromCostCenterKey: 'club', toCostCenterKey: 'jun', mode: 'percent', percent: 40, side: 'expense' });
  const fix = rule('f', { fromCostCenterKey: 'club', toCostCenterKey: 'jun', mode: 'amount', amount: new MoneyModel(200000, 'CHF'), side: 'revenue' });

  it('percent of the source budget for Soll and of its actuals for Ist, positive at the target', () => {
    expect(applyAllocations([pct], sel('jun'), rollUp, 2026, 'scs'))
      .toEqual([{ key: 'allocation:p', side: 'expense', title: 'R p', budget: 4000, actual: 3200 }]);
  });
  it('negative at the source', () => {
    expect(applyAllocations([pct], sel('club'), rollUp, 2026, 'scs')[0]).toMatchObject({ budget: -4000, actual: -3200 });
  });
  it('a fixed amount applies to Soll and Ist alike', () => {
    expect(applyAllocations([fix], sel('jun'), rollUp, 2026, 'scs')[0]).toMatchObject({ side: 'revenue', budget: 200000, actual: 200000 });
  });
  it('a selection holding both ends, «Alle», or neither end shows nothing', () => {
    expect(applyAllocations([pct], sel('club', 'jun'), rollUp, 2026, 'scs')).toEqual([]);
    expect(applyAllocations([pct], 'all', rollUp, 2026, 'scs')).toEqual([]);
    expect(applyAllocations([pct], sel('reg'), rollUp, 2026, 'scs')).toEqual([]);
  });
  it('archived rules and rules of another year or books have no effect', () => {
    expect(applyAllocations([{ ...pct, isArchived: true }], sel('jun'), rollUp, 2026, 'scs')).toEqual([]);
    expect(applyAllocations([pct], sel('jun'), rollUp, 2025, 'scs')).toEqual([]);
    expect(applyAllocations([pct], sel('jun'), rollUp, 2026, 'gss')).toEqual([]);
  });
  it('a group source takes its whole subtree; a source without budget yields 0 on Soll', () => {
    const fromGroup = rule('g', { fromCostCenterKey: 'sport', toCostCenterKey: 'club', mode: 'percent', percent: 10, side: 'expense' });
    expect(applyAllocations([fromGroup], sel('club'), rollUp, 2026, 'scs')[0]).toMatchObject({ budget: 500, actual: 400 });
    const noBudget = new Map(rollUp); noBudget.set('club', { expense: t(0, 8000), revenue: t(0, 0) });
    expect(applyAllocations([pct], sel('jun'), noBudget, 2026, 'scs')[0]).toMatchObject({ budget: 0, actual: 3200 });
  });
  it('a target inside a selected group counts (selection = subtree of «sport»)', () => {
    expect(applyAllocations([pct], sel('sport', 'jun', 'reg'), rollUp, 2026, 'scs')[0]).toMatchObject({ budget: 4000 });
  });
});
