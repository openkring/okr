import { DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel } from './base.model';
import { CurrencyCode } from './money.model';

/** The bank CSV layouts the import understands. One adapter per value (finance-bank-import-util). */
export type BankFormat = 'postfinance' | 'zkb' | 'yuh' | 'vz' | 'gkb' | 'swissquote' | 'raisenow' | 'bonuscard';

/**
 * One bank account (IBAN) of an accounting tenant, as seen by the CSV import (spec 1.60 §3.1).
 * Looked up by `iban` when a statement file is opened; `accountKey` is the ledger account the
 * statement books against. The CSV layout itself lives in code (`format`), not here.
 */
export class BankProfileModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public notes = DEFAULT_NOTES;

  public format: BankFormat = 'postfinance';
  public iban = '';                       // normalized: no spaces, upper case
  public bankName = '';
  public accountKey = '';                 // ref AccountModel (leaf bank account; a LIABILITY account for a credit card, spec 1.60 §4.13)
  public feeAccountKey = '';              // ref AccountModel: expense account for the processor fee; '' = no fee line (spec 1.62 §3.1)
  public currency: CurrencyCode = 'CHF';
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const BankProfileCollection = 'bank-profiles';
export const BankProfileModelName = 'bankProfile';
