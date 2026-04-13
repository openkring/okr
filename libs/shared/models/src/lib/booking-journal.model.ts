import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE } from '@bk2/shared-constants';
import { MoneyModel } from '@bk2/shared-models';

import { BkModel, SearchableModel, TaggedModel } from './base.model';

/**
 * Journal of financial bookings in Bexio
 */
export class BookingJournalModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES; // a detailed description of the invoice

  public title = DEFAULT_TITLE; // Bexio: description
  public date = DEFAULT_DATE; // Bexio: date, Format: StoreDate yyyymmdd
  public debitAccount = '';  // Bexio: debit_account_id (converted to string)
  public creditAccount = ''; // Bexio: credit_account_id (converted to string)

  public totalAmount: MoneyModel | undefined;  // Bexio: amount * 100

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const JournalCollection = 'journallogs';
export const JournalModelName = 'journal';

