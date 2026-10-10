import { describe, expect, it } from 'vitest';

import { CostAllocationFormModel, costAllocationValidations } from './cost-allocation.validations';

const base: CostAllocationFormModel = { title: 'Umlage Clubhaus', fiscalYear: 2026, side: 'expense', fromCostCenterKey: 'club', toCostCenterKey: 'jun', mode: 'percent', amount: 0, percent: 40, notes: '' };
const leaves = new Set(['club', 'jun']);
const run = (m: Partial<CostAllocationFormModel>) => costAllocationValidations({ ...base, ...m }, leaves);

describe('costAllocationValidations', () => {
  it('a complete percent rule is valid', () => expect(run({}).isValid()).toBe(true));
  it('title is required', () => expect(run({ title: '' }).getErrors('title')).toContain('required'));
  it('source and target are required, must be Kostenstellen of the books and differ', () => {
    expect(run({ fromCostCenterKey: '' }).getErrors('fromCostCenterKey')).toContain('required');
    expect(run({ toCostCenterKey: 'gone' }).getErrors('toCostCenterKey')).toContain('@finance/budget/feature.allocation.costCenter.unknown');
    expect(run({ toCostCenterKey: 'club' }).getErrors('toCostCenterKey')).toContain('@finance/budget/feature.allocation.to.same');
  });
  it('percent must lie in (0, 100]', () => {
    expect(run({ percent: 0 }).getErrors('percent')).toContain('@finance/budget/feature.allocation.percent.range');
    expect(run({ percent: 120 }).getErrors('percent')).toContain('@finance/budget/feature.allocation.percent.range');
    expect(run({ percent: 100 }).getErrors('percent')).toEqual([]);
  });
  it('a fixed amount must be positive; the percent is then not checked', () => {
    expect(run({ mode: 'amount', amount: 0, percent: 0 }).getErrors('amount')).toContain('@finance/budget/feature.allocation.amount.positive');
    expect(run({ mode: 'amount', amount: 200000, percent: 0 }).isValid()).toBe(true);
  });
  it('fiscal year between 2000 and 2100', () => expect(run({ fiscalYear: 1999 }).getErrors('fiscalYear').length).toBeGreaterThan(0));
});
