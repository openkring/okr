import { describe, it, expect } from 'vitest';
import { ExchangeRateModel } from '@bk2/shared-models';
import { convertAmount, pickClosestRate } from './exchange-rate.util';

describe('convertAmount', () => {
  it('converts amount in cents using the exchange rate', () => {
    // 100.00 CHF (10000 cents) at rate 1.08 → 10800 EUR cents
    expect(convertAmount(10000, 1.08)).toBe(10800);
  });

  it('rounds to nearest cent', () => {
    // 100.00 CHF at 1.085 → 10850 cents
    expect(convertAmount(10000, 1.085)).toBe(10850);
  });
});

describe('pickClosestRate', () => {
  const rates: Partial<ExchangeRateModel>[] = [
    { date: '20260101', fromCurrency: 'CHF', toCurrency: 'EUR', rate: 1.05 },
    { date: '20260115', fromCurrency: 'CHF', toCurrency: 'EUR', rate: 1.07 },
    { date: '20260201', fromCurrency: 'CHF', toCurrency: 'EUR', rate: 1.09 },
  ];

  it('returns the rate on the exact date', () => {
    const result = pickClosestRate(rates as ExchangeRateModel[], '20260115');
    expect(result?.rate).toBe(1.07);
  });

  it('returns the most recent rate before the given date when no exact match', () => {
    const result = pickClosestRate(rates as ExchangeRateModel[], '20260120');
    expect(result?.rate).toBe(1.07);
  });

  it('returns undefined when no rate exists on or before the date', () => {
    const result = pickClosestRate(rates as ExchangeRateModel[], '20251201');
    expect(result).toBeUndefined();
  });
});
