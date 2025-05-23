import { BkModel, NamedModel, SearchableModel, TaggedModel } from "./base.model";
import { GenderType } from "./enums/gender-type.enum";
import { ModelType } from "./enums/model-type.enum";
import { OrgType } from "./enums/org-type.enum";
import { InvoicePositionModel } from "./invoice-position.model";

/**
 * Invoice = Kundenrechnung (Debitor) in Bexio
 */
export class InvoiceModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';
  public description = '';          // a detailed description of the trip

  public name = '';                 // title
  public invoiceId = '';            // Rechnungsnummer
  public invoiceDate = '';          // Rechnungsdatum
  public dueDate = '';              // Zahlungsdatum
  public header = '';               // Rechnungskopf
  public footer = '';               // Rechnungsfuss
  public invoicePositions: InvoicePositionModel[] = [];

  public amount = 0;                // total amount
  public currency = 'CHF';
  public taxes = 0;                 // total taxes
  public taxRate = 0;               // tax rate in percent
  public isPaid = false;            // is the invoice paid
  public paymentDate = '';          // Datum der Zahlung
  public bexioUrl = '';             // URL to bexio invoice
// booking-account is on the invoice position

  // subject = invoice sender (Person or Org) Rechnungssteller
  public subjectKey = '';
  public subjectName = '';
  public subjectModelType? = ModelType.Person | ModelType.Org;
  public subjectType?: GenderType | OrgType;
  public subjectBexioId = '';       // Bexio ID of the subject

  // object = invoice receiver (Person or Org) Rechnungsempfänger
  public objectKey = '';
  public objectName = '';
  public objectModelType? = ModelType.Person | ModelType.Org;
  public objectType?: GenderType | OrgType;
  public objectBexioId = '';        // Bexio ID of the object

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvoiceCollection = 'invoices';