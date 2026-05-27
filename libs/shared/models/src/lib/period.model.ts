import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel } from './base.model';

// An accounting period (monthly or annual). Created automatically on first booking.
// Locked periods reject new bookings; corrections go into the current open period.
export class PeriodModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public year = 0;                    // fiscal year, e.g. 2026
  public month = 0;                   // 1–12 for monthly period; 0 = annual period
  public isLocked = false;
  public lockedBy = '';               // bkey of user who locked the period
  public lockedAt = DEFAULT_DATE;     // StoreDate yyyymmdd
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string, year = 0, month = 0) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
    this.year = year;
    this.month = month;
    if (year > 0) {
      this.bkey = month > 0
        ? `${accountingTenantId}-${year}-${String(month).padStart(2, '0')}`
        : `${accountingTenantId}-${year}`;
    }
  }
}

export const PeriodCollection = 'periods';
export const PeriodModelName = 'period';
