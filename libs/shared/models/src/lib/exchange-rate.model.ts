import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { CurrencyCode } from '@bk2/shared-models';

import { BkModel } from './base.model';

export type ExchangeRateSource = 'snb' | 'manual';
export type ExchangeRateType = 'daily' | 'monthly_avg' | 'yearly_avg';

// Exchange rates are shared across all accounting tenants within a bk-tenant.
// toCurrency is always the functional currency of the tenant (typically 'CHF').
// SNB rates are written by the fetchSnbRates Cloud Function; manual entries override for a specific date.
export class ExchangeRateModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public fromCurrency: CurrencyCode = 'EUR';
  public toCurrency: CurrencyCode = 'CHF';
  public rate = 0;                              // 1 fromCurrency = rate toCurrency
  public date = DEFAULT_DATE;                   // StoreDate yyyymmdd
  public source: ExchangeRateSource = 'snb';
  public rateType: ExchangeRateType = 'daily';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExchangeRateCollection = 'exchange-rates';
export const ExchangeRateModelName = 'exchangeRate';
