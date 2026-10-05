import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel } from './base.model';
import { MoneyModel } from './money.model';

export type BankImportRowStatus = 'unmapped' | 'mapped' | 'posted' | 'error';

/**
 * One further part of a split assignment ("Konto zuweisen" → Teilbetrag): its own Buchungstext,
 * counter-account, VAT code and amount. `amount` is a positive magnitude in minor units of the
 * row's currency; the sign comes from the row, like for the main part.
 */
export interface BankImportSplit {
  title: string;
  accountKey: string;
  vatCodeKey: string;
  amount: number;
}

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
  public amount: MoneyModel = new MoneyModel(0, 'CHF');   // signed GROSS amount: + Gutschrift, − Lastschrift
  public fee: MoneyModel = new MoneyModel(0, 'CHF');      // ≥ 0, payment-processor fee in the currency of `amount`; net = amount − fee (spec 1.62 §3.2)
  public amountFx: MoneyModel | undefined;
  public fxRate = 0;
  public bankReference = '';
  public paymentReference = '';           // creditor reference (QRR/SCOR) from camt or found in the text, normalized; spec 1.2
  public invoiceKey = '';                 // invoice this credit pays (matched by paymentReference); '' = none
  public billKey = '';                    // bill this debit pays (matched by reference or amount + vendor, spec 1.85); '' = none
  public saldo: MoneyModel | undefined;

  public title = '';
  public accountKey = '';                 // counter-account
  public vatCodeKey = '';
  public ruleKey = '';                    // '' = one-off assignment
  // Further parts of a one-off split. The main part (title/accountKey/vatCodeKey) keeps the rest:
  // |amount| − Σ splits. Empty = the whole amount goes to accountKey. Missing on legacy docs.
  public splits: BankImportSplit[] = [];
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
