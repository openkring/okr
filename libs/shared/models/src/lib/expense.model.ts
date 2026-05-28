import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel, SearchableModel, TaggedModel } from './base.model';

export type ExpenseStatus = 'draft' | 'processing' | 'validated' | 'error' | 'posted';

export class ExpenseModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public abstract = '';
  public amountTotal = 0;
  public currency = 'CHF';
  public iban = '';
  public category = '';
  public costCenterId = '';
  public note = '';
  public status: ExpenseStatus = 'draft';
  public bookingKey = DEFAULT_KEY;
  public userId = DEFAULT_KEY;
  public accountingTenantId = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExpenseCollection = 'expenses';
export const ExpenseModelName = 'expense';
