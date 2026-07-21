import { DEFAULT_CURRENCY, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel, SearchableModel, TaggedModel } from './base.model';

// 'posted'         = booked in okr's own ledger (native accounting backend).
// 'pending-export' = expense + receipts saved, but the accounting entry is owned by an external
//                    backend (e.g. Bexio); okr does not write a local booking for it.
export type ExpenseStatus = 'draft' | 'processing' | 'validated' | 'error' | 'posted' | 'pending-export';

/** Where the reimbursement is paid: 'me' = to the employee (needs an IBAN), 'issuer' = to the invoice issuer. */
export type ExpenseTransferTo = 'me' | 'issuer';

export class ExpenseModel implements OkrModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public abstract = '';
  public amountTotal = 0;
  public currency = DEFAULT_CURRENCY;
  public transferTo: ExpenseTransferTo = 'me';
  public iban = '';
  public category = '';
  public costCenterId = '';
  public note = '';
  public status: ExpenseStatus = 'draft';
  public bookingKey = '';
  public userId = DEFAULT_KEY;
  public accountingTenantId = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExpenseCollection = 'expenses';
export const ExpenseModelName = 'expense';
