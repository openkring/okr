import { ExchangeRateModel } from '@bk2/shared-models';

export function convertAmount(amountCents: number, rate: number): number {
  return Math.round(amountCents * rate);
}

/**
 * Returns the rate with the latest date on or before storeDate ("YYYYMMDD").
 * Future-dated rates are excluded.
 */
export function pickClosestRate(rates: ExchangeRateModel[], storeDate: string): ExchangeRateModel | undefined {
  const eligible = rates.filter(r => (r.date ?? '') <= storeDate);
  if (eligible.length === 0) return undefined;
  return eligible.reduce((best, r) => ((r.date ?? '') > (best.date ?? '') ? r : best));
}
