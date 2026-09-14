import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel } from './base.model';
import { MoneyModel } from './money.model';

export type BankImportRowStatus = 'unmapped' | 'mapped' | 'posted' | 'error';

/**
 * One parsed bank statement line in the import staging table (spec 1.60 §3.3).
 * Document id == `importKey` (SHA-256 of iban|date|amount|reference|normalized text|occurrence),
 * which is what makes overlapping downloads and re-runs safe. The posted booking has the id
 * `bank-{importKey}` and is created only by the `postBankImport` callable.
 */
export class BankImportRowModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public importKey = '';
  public bankProfileKey = '';
  public date = DEFAULT_DATE;             // StoreDate yyyymmdd
  public rawText = '';
  public payee = '';
  public amount: MoneyModel = new MoneyModel(0, 'CHF');   // signed: + Gutschrift, − Lastschrift
  public amountFx: MoneyModel | undefined;
  public fxRate = 0;
  public bankReference = '';
  public saldo: MoneyModel | undefined;

  public title = '';
  public accountKey = '';                 // counter-account
  public vatCodeKey = '';
  public ruleKey = '';                    // '' = one-off assignment
  public status: BankImportRowStatus = 'unmapped';
  public bookingKey = '';
  public error = '';                      // error code, translated client-side

  public sourceFileName = '';
  public importedAt = '';                 // StoreDateTime
  public importedBy = '';                 // user okey
  public postedAt = '';
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const BankImportRowCollection = 'bank-import-rows';
export const BankImportRowModelName = 'bankImportRow';
