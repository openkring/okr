import { BkModel, NamedModel, SearchableModel, TaggedModel } from "./base.model";
import { GenderType } from "./enums/gender-type.enum";
import { ModelType } from "./enums/model-type.enum";
import { OrgType } from "./enums/org-type.enum";

/**
 * Bill = Lieferantenrechnung (Kreditor) in Bexio
 * 
 */
export class BillModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';
  public description = '';          // a detailed description of the trip

  public name = '';                 // title
  public billId = '';               // Rechnungsnummer
  public billDate = '';             // Rechnungsdatum
  public dueDate = '';              // Gültig bis

  public amount = 0;                // total amount
  public currency = 'CHF';
  public taxes = 0;                 // total taxes
  public taxRate = 0;               // tax rate in percent
  public isPaid = false;            // is the invoice paid
  public paymentDate = '';          // Datum der Zahlung
  public bexioUrl = '';             // URL to bexio invoice
  public bookingAccountId = '';     // Bexio ID of the booking account

  // subject = invoice receiver (Person or Org) Rechnungsempfänger (ich oder meine Org)
  public subjectKey = '';
  public subjectModelType? = ModelType.Person | ModelType.Org;
  public subjectBexioId = '';       // Bexio ID of the subject

  // object = invoice sender (Person or Org) Rechnungssteller / Lieferant
  public objectKey = '';
  public objectName = '';
  public objectModelType? = ModelType.Person | ModelType.Org;
  public objectType?: GenderType | OrgType;
  public objectBexioId = '';        // Bexio ID of the object

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const BillCollection = 'bills';