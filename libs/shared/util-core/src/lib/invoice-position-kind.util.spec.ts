import { describe, expect, it } from 'vitest';

import { isMoneyPosition, isRebatePosition } from './invoice-position-kind.util';

describe('isMoneyPosition', () => {
  it('treats layout kinds as non-money and everything else, legacy included, as money', () => {
    expect(['text', 'subtotal', 'pageBreak'].map((type) => isMoneyPosition({ type }))).toEqual([false, false, false]);
    expect(['fix', 'rebate', 'unit', ''].map((type) => isMoneyPosition({ type }))).toEqual([true, true, true, true]);
    expect(isMoneyPosition({})).toBe(true);
    expect(isMoneyPosition(undefined)).toBe(true);
  });
});

describe('isRebatePosition', () => {
  it('is true for the rebate type only', () => {
    expect(isRebatePosition({ type: 'rebate' })).toBe(true);
    expect(isRebatePosition({ type: 'fix' })).toBe(false);
    expect(isRebatePosition(undefined)).toBe(false);
  });
});
