import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE } from '@bk2/shared-constants';

import { BkModel, SearchableModel, TaggedModel } from './base.model';

export type BookingStatus = 'draft' | 'posted' | 'cancelled';

// Header record for a double-entry booking. All amounts live in BookingLineModel.
// Every booking has at least two BookingLineModel entries (debit + credit sides).
export class BookingModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public title = DEFAULT_TITLE;           // booking description
  public date = DEFAULT_DATE;             // booking date, StoreDate yyyymmdd

  public bookingNo = 0;                   // sequential per year + accountingTenantId
  public periodKey = '';                  // ref to PeriodModel
  public documentKey = '';               // ref to DocumentModel (voucher)
  public status: BookingStatus = 'draft';
  public accountingTenantId = '';        // = org.bkey of the accounting tenant

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const BookingCollection = 'bookings';
export const BookingModelName = 'booking';
