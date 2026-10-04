import { DEFAULT_CURRENCY, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_INVOICE_POSITION_TYPE, DEFAULT_INVOICE_POSITION_USAGE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class InvoicePositionModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME; // a meaningful name for the trip (i18n)
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public description = DEFAULT_NOTES; // a detailed description of the trip
  public personKey = DEFAULT_KEY;
  public firstName = DEFAULT_NAME;
  public lastName = DEFAULT_NAME;
  public invoiceKey = DEFAULT_KEY; // ref to InvoiceModel.okey
  // money: 'fix' | 'unit' | 'hours' | 'days' | 'deduction' | 'rebate'; layout (no amount, no account, spec 1.84): 'text' | 'subtotal' | 'pageBreak'
  public invoicePositionType = DEFAULT_INVOICE_POSITION_TYPE;
  public invoicePositionUsage = DEFAULT_INVOICE_POSITION_USAGE;
  public year = 0;
  public amount = DEFAULT_PRICE;
  public currency = DEFAULT_CURRENCY;
  public isBillable = true;
  public bookingAccountId = DEFAULT_ID;   // Bexio account ID (kept for Bexio compatibility)
  public accountKey = '';                 // ref to AccountModel (revenue account in okr chart of accounts)
  public vatCodeKey = '';                 // ref to VatCodeModel
  // display order on the invoice (spec 1.84 K3); written by writeInvoice as the editor's list index
  public sortOrder = 0;
  // rebate positions only: the rate in percent; 0 = a fixed amount (spec 1.84 K4). `amount` holds the result.
  public discountPercent = 0;

  // Stamped (StoreDateTime) when a data-subject erasure pseudonymized this record
  // (privacy 1.19, D-P5-6): the name fields and the person link are overwritten, the
  // amounts, dates and document references stay. '' = never anonymized.
  public anonymizedAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvoicePositionCollection = 'invoice-positions';
export const InvoicePositionModelName = 'invoice-position';
