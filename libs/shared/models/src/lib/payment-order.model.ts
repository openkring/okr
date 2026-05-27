import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel } from './base.model';

export type PaymentOrderStatus = 'draft' | 'approved' | 'transmitted' | 'accepted' | 'rejected';

// How the order is transmitted to the bank. pain001_download generates XML for manual e-banking upload.
// bexio_api and ebics are future delivery channels — same approval flow, different transmission step.
export type PaymentDeliveryMethod = 'pain001_download' | 'bexio_api' | 'ebics';

// Groups one or more PaymentModel entries into a single bank submission.
// One PaymentOrderModel = one pain.001 file (or equivalent for other delivery methods).
export class PaymentOrderModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public messageId = '';                                    // unique per file, e.g. 'SCS-2026-0042'
  public status: PaymentOrderStatus = 'draft';
  public deliveryMethod: PaymentDeliveryMethod = 'pain001_download';
  public debitAccountKey = '';                             // ref to AccountModel (own bank account)
  public executionDate = DEFAULT_DATE;                     // StoreDate yyyymmdd (RequestedExecutionDate)
  public pain001Xml = '';                                  // populated for pain001_download after approval
  public createdBy = '';                                   // bkey of creating user
  public approvedBy = '';                                  // bkey of approving user (four-eyes)
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const PaymentOrderCollection = 'payment-orders';
export const PaymentOrderModelName = 'paymentOrder';
