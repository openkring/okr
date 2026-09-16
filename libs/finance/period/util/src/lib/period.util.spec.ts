import { describe, expect, it } from 'vitest';

import { PeriodModel } from '@okr/shared-models';

import { periodRange } from './period.util';

function makePeriod(year: number, month = 0): PeriodModel {
  return new PeriodModel('scs', 'scs', year, month);
}

describe('periodRange', () => {
  it('spans the calendar month of a monthly period', () => {
    expect(periodRange(makePeriod(2026, 2))).toEqual({ from: '20260201', to: '20260228' });
    expect(periodRange(makePeriod(2024, 2))).toEqual({ from: '20240201', to: '20240229' });  // leap year
    expect(periodRange(makePeriod(2026, 12))).toEqual({ from: '20261201', to: '20261231' });
  });

  it('spans the calendar year of an annual period when the fiscal year starts in January', () => {
    expect(periodRange(makePeriod(2026))).toEqual({ from: '20260101', to: '20261231' });
  });

  it('spans the shifted fiscal year of an annual period', () => {
    expect(periodRange(makePeriod(2026), 7)).toEqual({ from: '20260701', to: '20270630' });
  });

  it('ignores the fiscal year start for a monthly period', () => {
    expect(periodRange(makePeriod(2026, 7), 7)).toEqual({ from: '20260701', to: '20260731' });
  });
});
