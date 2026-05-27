import { DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { CurrencyCode, MoneyModel } from '@bk2/shared-models';

import { BkModel } from './base.model';
import { VatMethod } from './vat-code.model';

export type VatPeriod = 'quarterly' | 'monthly' | 'semi-annual';
export type DepreciationFrequency = 'monthly' | 'annual';
export type DepreciationProRata = 'daily' | 'semi-annual';

// Determines whether bk2 is the system of record or a read-only sync cache.
// 'native': full CRUD via bk2 accounting features.
// 'bexio': Bexio is authoritative; bk2 collections are populated by sync Cloud Functions and are read-only in the UI.
// 'datev': reserved for future DATEV integration.
export type AccountingBackend = 'native' | 'bexio' | 'datev';

// Historical VAT rates per year — stored inline, no own collection needed.
export interface VatRateEntry {
  year: number;
  standardRate: number;       // e.g. 8.1
  reducedRate: number;        // e.g. 2.6
  accommodationRate: number;  // e.g. 3.8
}

// One document per accounting tenant. bkey = accountingTenantId.
export class AccountingConfigModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public accountingTenantId = '';                     // = org.bkey; also stored as bkey
  public accountingBackend: AccountingBackend = 'native'; // 'native' = full CRUD; 'bexio'/'datev' = read-only cache
  public functionalCurrency: CurrencyCode = 'CHF';
  public secondaryCurrency: CurrencyCode | undefined; // optional display currency in reports
  public fiscalYearStart = 1;                         // month 1–12; default 1 (January)

  public vatMethod: VatMethod = 'effective';
  public vatMethodYear = 0;                           // year from which vatMethod applies
  public vatPeriod: VatPeriod = 'quarterly';
  public vatRates: VatRateEntry[] = [];               // one entry per year; historical rates kept

  public assetCapitalizationLimit: MoneyModel | undefined;  // items below limit → immediate expense
  public depreciationFrequency: DepreciationFrequency = 'annual';
  public depreciationProRata: DepreciationProRata = 'daily';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
    this.bkey = accountingTenantId;
  }
}

export const AccountingConfigCollection = 'accounting-configs';
export const AccountingConfigModelName = 'accountingConfig';
