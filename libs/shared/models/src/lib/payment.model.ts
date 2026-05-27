import { DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { MoneyModel } from '@bk2/shared-models';

import { BkModel } from './base.model';

export type PaymentStatus = 'draft' | 'approved' | 'transmitted' | 'accepted' | 'partial_rejected' | 'rejected';

// One transaction within a PaymentOrderModel.
// bookingKey is set only after the bank debit is confirmed (camt.054), not on transmission.
export class PaymentModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public paymentOrderKey = '';                    // ref to PaymentOrderModel
  public billKey = '';                            // ref to BillModel (creditor invoice being paid)
  public endToEndId = '';                         // unique per payment; used for bank reconciliation
  public amount: MoneyModel | undefined;
  public recipientName = '';
  public recipientIban = '';
  public recipientBic = '';
  public recipientAddress = '';                   // structured or unstructured per payment type
  public reference = '';                          // QR-ref / ISO11649 / free text
  public status: PaymentStatus = 'draft';
  public reasonCode = '';                         // pain.002 rejection reason code
  public bookingKey = '';                         // ref to BookingModel; set after bank debit confirmed
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const PaymentCollection = 'payments';
export const PaymentModelName = 'payment';
