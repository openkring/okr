import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel, NamedModel } from './base.model';

export type VatMethod = 'effective' | 'net_tax_rate' | 'flat_rate' | 'exempt';
export type VatDirection = 'input' | 'output';

// A VAT code defines the rate and booking account for one type of VAT treatment.
// Historical codes (expired validTo) remain to support past-period reporting.
export class VatCodeModel implements BkModel, NamedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public name = DEFAULT_NAME;           // human-readable label, e.g. 'Umsatz Normalsatz 8.1%'
  public code = '';                     // short code, e.g. 'UST_81', 'VST_MAT'
  public rate = 0;                      // percentage, e.g. 8.1
  public validFrom = DEFAULT_DATE;      // StoreDate yyyymmdd; start of validity
  public validTo = DEFAULT_DATE;        // StoreDate yyyymmdd; '' = currently valid
  public accountKey = '';               // ref to AccountModel (VAT booking account)
  public method: VatMethod = 'effective';
  public direction: VatDirection = 'output';
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const VatCodeCollection = 'vat-codes';
export const VatCodeModelName = 'vatCode';
