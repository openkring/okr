import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_URL } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * Bill = Lieferantenrechnung (Kreditor) in Bexio
 */
export class BillModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public description = DEFAULT_NOTES; // a detailed description of the trip

  public name = DEFAULT_NAME; // title
  public billId = DEFAULT_ID; // Rechnungsnummer
  public billDate = DEFAULT_DATE; // Rechnungsdatum
  public dueDate = DEFAULT_DATE; // Gültig bis

  public amount = DEFAULT_PRICE; // total amount
  public currency = DEFAULT_CURRENCY;
  public taxes = DEFAULT_PRICE; // total taxes
  public taxRate = 0; // tax rate in percent
  public isPaid = false; // is the invoice paid
  public paymentDate = DEFAULT_DATE; // Datum der Zahlung
  public bexioUrl = DEFAULT_URL; // URL to bexio invoice
  public bookingAccountId = DEFAULT_ID; // Bexio ID of the booking account

  // subject = invoice receiver (Person or Org) Rechnungsempfänger (ich oder meine Org)
  public subjectKey = DEFAULT_KEY;
  public subjectModelType: 'person' | 'org' = 'person';
  public subjectBexioId = DEFAULT_ID; // Bexio ID of the subject

  // object = invoice sender (Person or Org) Rechnungssteller / Lieferant
  public objectKey = DEFAULT_KEY;
  public objectName = DEFAULT_NAME;
  public objectModelType: 'person' | 'org' = 'person';
  public objectType = DEFAULT_GENDER;
  public objectBexioId = DEFAULT_ID; // Bexio ID of the object

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const BillCollection = 'bills';
