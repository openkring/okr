import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE, DEFAULT_URL } from '@bk2/shared-constants';
import { AvatarInfo, MoneyModel } from '@bk2/shared-models';

import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { InvoicePositionModel } from './invoice-position.model';

/**
 * Invoice = Kundenrechnung (Debitor) in Bexio
 */
export class InvoiceModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES; // a detailed description of the invoice

  public title = DEFAULT_TITLE;
  public invoiceId = DEFAULT_ID; // Rechnungsnummer
  public invoiceDate = DEFAULT_DATE; // Rechnungsdatum
  public dueDate = DEFAULT_DATE; // Zahlungsdatum
  public header = ''; // Rechnungskopf
  public footer = ''; // Rechnungsfuss
  public invoicePositions: InvoicePositionModel[] = [];

  public totalAmount: MoneyModel | undefined;
  public taxes = 0; // total taxes
  public taxRate = 0; // tax rate in percent
  public state = 'created'; // Category invoice_state
  public paymentDate = DEFAULT_DATE; // Datum der Zahlung
  public bexioUrl = DEFAULT_URL; // URL to bexio invoice
  // booking-account is on the invoice position

  // invoice sender (Person or Org) Rechnungssteller
  public invoiceSender: AvatarInfo | undefined;   // read bexioid from person

  // invoice receiver (Person or Org) Rechnungsempfänger
  public invoiceReceiver: AvatarInfo | undefined;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvoiceCollection = 'invoices';
export const InvoiceModelName = 'invoice';
