import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { CurrencyCode, MoneyModel } from '@okr/shared-models';

import { OkrModel } from './base.model';
import { VatMethod } from './vat-code.model';

export type VatPeriod = 'quarterly' | 'monthly' | 'semi-annual';
export type DepreciationFrequency = 'monthly' | 'annual';
export type DepreciationProRata = 'daily' | 'semi-annual';

// Determines whether okr is the system of record or a read-only sync cache.
// 'native': full CRUD via okr accounting features.
// 'bexio': Bexio is authoritative; okr collections are populated by sync Cloud Functions and are read-only in the UI.
// 'datev': reserved for future DATEV integration.
export type AccountingBackend = 'native' | 'bexio' | 'datev';

// Historical VAT rates per year — stored inline, no own collection needed.
export interface VatRateEntry {
  year: number;
  standardRate: number;       // e.g. 8.1
  reducedRate: number;        // e.g. 2.6
  accommodationRate: number;  // e.g. 3.8
}

export type FeeSource = 'category' | 'flag' | 'manual' | 'rule';

// Closed registries — every member is a predicate implemented and tested in code, never an
// expression in the database: these run against MembershipModel and must be reviewable.
export type FeeFlag = 'hasLocker';
export type FeeRule = 'newMemberOver25';

export interface FeePositionRule {
  key: string;
  usage: string;
  type: string;
  label: string;
  source: FeeSource;
  categoryList?: string;  // source 'category' — override list (e.g. mcat_srv); empty = the org's membershipCategoryKey
  flag?: FeeFlag;         // source 'flag'
  rule?: FeeRule;         // source 'rule'
  amount?: number;        // source 'flag' | 'rule'; default for 'manual'
  accountKey?: string;    // revenue account (AccountModel) for the native posting path
  bexioAccountId?: number; // the same revenue account's id in Bexio — see MemberFeePosition
  vatCodeKey?: string;
}

/** One year's price list. Year-versioned like `vatRates`, so re-running 2025 reproduces 2025. */
export interface FeeScheduleEntry {
  year: number;
  positions: FeePositionRule[];
}

// One document per accounting tenant. okey = accountingTenantId.
export class AccountingConfigModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public accountingTenantId = '';                     // = org.okey; also stored as okey
  public accountingBackend: AccountingBackend = 'native'; // 'native' = full CRUD; 'bexio'/'datev' = read-only cache
  public functionalCurrency: CurrencyCode = 'CHF';
  public secondaryCurrency: CurrencyCode | undefined; // optional display currency in reports
  public fiscalYearStart = 1;                         // month 1–12; default 1 (January)

  public vatMethod: VatMethod = 'effective';
  public vatMethodYear = 0;                           // year from which vatMethod applies
  public vatPeriod: VatPeriod = 'quarterly';
  public vatRates: VatRateEntry[] = [];               // one entry per year; historical rates kept
  public feeSchedule: FeeScheduleEntry[] = [];        // one entry per year; historical kept

  public assetCapitalizationLimit: MoneyModel | undefined;  // items below limit → immediate expense
  public depreciationFrequency: DepreciationFrequency = 'annual';
  public depreciationProRata: DepreciationProRata = 'daily';
  public defaultExpenseAccountKey = '';
  public defaultCostCenterKey = '';   // CostCenterModel okey; '' = keine Kostenstelle. Last fallback for P&L lines (spec 1.65)
  public employeePayablesAccountKey = '';
  public receivablesAccountKey = '';             // Debitoren leaf (scs: 1100) — invoices post here on issue (spec 1.76 D5)
  public invoiceTemplateId = '';                 // templates/{id} rendered by issueInvoice (spec 1.76 D7)
  public invoicePaymentAccountKeys: string[] = []; // leaf accounts a payment may be posted to (spec 1.76 D11)
  public reminderTemplateId = '';                // templates/{id} rendered by sendInvoiceReminder (spec 1.76 D13)
  public reminderFeeAccountKey = '';             // leaf account credited with the reminder fee (spec 1.76 D14)
  public reminderFees: number[] = [0, 2000, 2000]; // Rappen per reminder level 1..3 (spec 1.76 D14)
  public reminderGraceDays = 10;                 // days after the last due date before a Mahnlauf offers a reminder (spec 1.76 D12)
  public reminderDueDays = 14;                   // days a reminder grants to pay (spec 1.76 D12)
  public reviewAssigneePersonKey = ''; // treasurer person.okey who reviews OCR bookings; '' → first treasurer

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
    this.okey = accountingTenantId;
  }
}

export const AccountingConfigCollection = 'accounting-configs';
export const AccountingConfigModelName = 'accountingConfig';
