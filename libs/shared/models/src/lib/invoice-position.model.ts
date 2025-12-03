import { DEFAULT_CURRENCY, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_INVOICE_POSITION_TYPE, DEFAULT_INVOICE_POSITION_USAGE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class InvoicePositionModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME; // a meaningful name for the trip (i18n)
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public description = DEFAULT_NOTES; // a detailed description of the trip
  public personKey = DEFAULT_KEY;
  public firstName = DEFAULT_NAME;
  public lastName = DEFAULT_NAME;
  public invoicePositionType = DEFAULT_INVOICE_POSITION_TYPE;
  public invoicePositionUsage = DEFAULT_INVOICE_POSITION_USAGE;
  public year = 0;
  public amount = DEFAULT_PRICE;
  public currency = DEFAULT_CURRENCY;
  public isBillable = true;
  public bookingAccountId = DEFAULT_ID;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvoicePositionCollection = 'invoice-positions';
export const InvoicePositionModelName = 'invoice-position';
