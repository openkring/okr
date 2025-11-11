import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE, DEFAULT_URL } from '@bk2/shared-constants';
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
  public description = DEFAULT_NOTES; // a detailed description of the trip

  public title = DEFAULT_TITLE;
  public invoiceId = DEFAULT_ID; // Rechnungsnummer
  public invoiceDate = DEFAULT_DATE; // Rechnungsdatum
  public dueDate = DEFAULT_DATE; // Zahlungsdatum
  public header = ''; // Rechnungskopf
  public footer = ''; // Rechnungsfuss
  public invoicePositions: InvoicePositionModel[] = [];

  public amount = DEFAULT_PRICE; // total amount
  public currency = DEFAULT_CURRENCY;
  public taxes = 0; // total taxes
  public taxRate = 0; // tax rate in percent
  public isPaid = false; // is the invoice paid
  public paymentDate = DEFAULT_DATE; // Datum der Zahlung
  public bexioUrl = DEFAULT_URL; // URL to bexio invoice
  // booking-account is on the invoice position

  // subject = invoice sender (Person or Org) Rechnungssteller
  public subjectKey = DEFAULT_KEY;
  public subjectName = DEFAULT_NAME;
  public subjectModelType: 'person' | 'org' = 'person';
  public subjectType = DEFAULT_GENDER;
  public subjectBexioId = DEFAULT_ID; // Bexio ID of the subject

  // object = invoice receiver (Person or Org) Rechnungsempfänger
  public objectKey = DEFAULT_KEY;
  public objectName = DEFAULT_NAME;
  public objectModelType: 'person' | 'org' = 'org';
  public objectType = DEFAULT_ORG_TYPE;
  public objectBexioId = DEFAULT_ID; // Bexio ID of the object

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvoiceCollection = 'invoices';
