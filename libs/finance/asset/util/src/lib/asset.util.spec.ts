import { describe, it, expect } from 'vitest';
import { linearDepreciationMonthly, computeBookValue, proRataMonths } from './asset.util';

describe('linearDepreciationMonthly', () => {
  it('computes monthly depreciation amount in cents', () => {
    // 12000.00 CHF over 60 months = 200.00 CHF/month = 20000 cents
    expect(linearDepreciationMonthly(1200000, 60)).toBe(20000);
  });

  it('rounds fractional cents down', () => {
    // 100.00 CHF over 3 months = 33.333... → 3333 cents
    expect(linearDepreciationMonthly(10000, 3)).toBe(3333);
  });
});

describe('proRataMonths', () => {
  it('returns full month count when asset runs through full period', () => {
    // commissioned 2026-01-01, period end 2026-12-31 → 12 months
    expect(proRataMonths('20260101', '20261231')).toBe(12);
  });

  it('returns partial months when commissioned mid-year', () => {
    // commissioned 2026-07-01, period end 2026-12-31 → 6 months
    expect(proRataMonths('20260701', '20261231')).toBe(6);
  });

  it('returns 0 when asset commissioned after period end', () => {
    expect(proRataMonths('20270101', '20261231')).toBe(0);
  });
});

describe('computeBookValue', () => {
  it('computes book value as acquisition minus accumulated depreciation', () => {
    // Acquisition 1200.00 CHF, 2 months depreciation at 200 CHF/month → 800.00 CHF = 80000 cents
    expect(computeBookValue(120000, 20000, 2)).toBe(80000);
  });

  it('never returns a negative book value', () => {
    expect(computeBookValue(10000, 10000, 2)).toBe(0);
  });
});
