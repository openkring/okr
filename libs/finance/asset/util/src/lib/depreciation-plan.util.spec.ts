import { describe, expect, it } from 'vitest';

import { AssetModel, AssetMovementModel, MoneyModel } from '@okr/shared-models';

import { depreciationBookingKey, depreciationForYear, depreciationPlan } from './depreciation-plan.util';

const FY2026 = { from: '20260101', to: '20261231' };
const FY2027 = { from: '20270101', to: '20271231' };
const FY2028 = { from: '20280101', to: '20281231' };

function asset(patch: Partial<AssetModel> = {}): AssetModel {
  return Object.assign(new AssetModel('scs', 'scs'), {
    okey: 'a1', assetNo: 'B-1', name: 'Boot', commissioningDate: '20260401', acquisitionDate: '20260315',
    acquisitionValue: new MoneyModel(36000, 'CHF'), usefulLifeMonths: 24,
    expenseAccountKey: 'exp', balanceAccountKey: 'bal',
  }, patch);
}

function movement(assetKey: string, type: AssetMovementModel['movementType'], date: string, amount: number, bookingKey = ''): AssetMovementModel {
  return Object.assign(new AssetMovementModel('scs', 'scs'), { assetKey, movementType: type, date, amount: new MoneyModel(amount, 'CHF'), bookingKey });
}

describe('depreciationForYear', () => {
  it('books only the months of the first year, from the commissioning month', () => {
    // 36000 / 24 = 1500 per month; April–December = 9 months
    expect(depreciationForYear(asset(), FY2026, 0)).toBe(13500);
  });
  it('books a full middle year', () => {
    expect(depreciationForYear(asset(), FY2027, 13500)).toBe(18000);
  });
  it('writes off the rest in the year the useful life ends', () => {
    // 3 months left (Jan–Mar 2028): 4500 = 36000 − 31500
    expect(depreciationForYear(asset(), FY2028, 31500)).toBe(4500);
  });
  it('writes off the rounding remainder in the last year', () => {
    const odd = asset({ acquisitionValue: new MoneyModel(1000, 'CHF'), usefulLifeMonths: 3, commissioningDate: '20261001' });
    // floor(1000 / 3) = 333 per month; Oct–Dec is the whole life: the full 1000
    expect(depreciationForYear(odd, FY2026, 0)).toBe(1000);
  });
  it('never goes below zero book value', () => {
    expect(depreciationForYear(asset(), FY2027, 35000)).toBe(1000);
    expect(depreciationForYear(asset(), FY2027, 36000)).toBe(0);
  });
  it('books nothing before commissioning or without a useful life', () => {
    expect(depreciationForYear(asset({ commissioningDate: '20270101' }), FY2026, 0)).toBe(0);
    expect(depreciationForYear(asset({ usefulLifeMonths: 0 }), FY2026, 0)).toBe(0);
  });
  it('falls back to the acquisition date', () => {
    expect(depreciationForYear(asset({ commissioningDate: '' }), FY2026, 0)).toBe(15000);   // March–December = 10 months
  });
});

describe('depreciationPlan', () => {
  it('starts from the depreciation booked in earlier years and marks the year as open', () => {
    const rows = depreciationPlan([asset()], [movement('a1', 'depreciation', '20261231', 13500, 'depreciation-scs-2026')], FY2027);
    expect(rows).toEqual([expect.objectContaining({ assetKey: 'a1', bookValueStart: 22500, amount: 18000, bookValueEnd: 4500 })]);
    expect(rows[0].booked).toBeUndefined();
  });
  it('shows a booked year with the booked amount', () => {
    const rows = depreciationPlan([asset()], [movement('a1', 'depreciation', '20261231', 13500, 'depreciation-scs-2026')], FY2026);
    expect(rows[0]).toEqual(expect.objectContaining({ bookValueStart: 36000, amount: 13500, booked: 13500, bookingKey: 'depreciation-scs-2026' }));
  });
  it('skips an asset disposed before the year', () => {
    expect(depreciationPlan([asset()], [movement('a1', 'full_disposal', '20261115', 0)], FY2027)).toEqual([]);
  });
  it('counts extra write-downs into the book value', () => {
    const rows = depreciationPlan([asset()], [movement('a1', 'extra_depreciation', '20260601', 30000)], FY2027);
    expect(rows[0]).toEqual(expect.objectContaining({ bookValueStart: 6000, amount: 6000 }));
  });
});

describe('depreciationBookingKey', () => {
  it('is one key per books and fiscal year', () => {
    expect(depreciationBookingKey('scs', 2026)).toBe('depreciation-scs-2026');
  });
});
