import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { InvoicePositionType } from './enums/invoice-position-type.enum';

export class InvoicePositionModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public name = ''; // a meaningful name for the trip (i18n)
  public index = '';
  public tags = '';
  public description = ''; // a detailed description of the trip
  public personKey = '';
  public firstName = '';
  public lastName = '';
  public invoicePositionType: InvoicePositionType | undefined = undefined;
  public year = 0;
  public amount = 0;
  public currency = 'CHF';
  public isBillable = true;
  public bookingAccountId = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvoicePositionCollection = 'invoice-positions2';
