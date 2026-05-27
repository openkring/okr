import { DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { MoneyModel } from '@bk2/shared-models';

import { BkModel } from './base.model';

// One side of a double-entry booking line. Every BookingModel has ≥2 lines.
// Invariant: Σ debitAmount = Σ creditAmount across all lines of a booking (in functional currency).
export class BookingLineModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public bookingKey = '';                   // ref to BookingModel
  public accountKey = '';                   // ref to AccountModel (leaf account)
  public debitAmount: MoneyModel | undefined;   // in functional currency; undefined if credit line
  public creditAmount: MoneyModel | undefined;  // in functional currency; undefined if debit line
  public amountFx: MoneyModel | undefined;      // original foreign currency amount (Phase 4)
  public exchangeRateKey = '';               // ref to ExchangeRateModel (Phase 4)
  public vatCodeKey = '';                    // ref to VatCodeModel (Phase 3)
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const BookingLineCollection = 'booking-lines';
export const BookingLineModelName = 'bookingLine';
