import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { ModelType } from './enums/model-type.enum';

/**
 * Expense = Spesenrechnung
 */
export class ExpenseModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';
  public description = '';

  public name = ''; // title
  public billId = ''; // Rechnungsnummer
  public paidOnDate = ''; // Spesen Rechnung bezahlt
  public expenseDate = ''; // Empfangsdatum der Spesenrechnung
  public expensePaidDate = ''; // Datum der Rückerstattung der Spesenrechnung
  public dueDate = ''; // Zahlungsdatum der Spesenrechnung

  public totalAmount = 0; // total amount
  public currency = 'CHF';
  public taxes = 0; // total taxes
  public taxRate = 0; // tax rate in percent
  public isPaid = false; // is the expense paid
  public bookingAccountId = ''; // Bexio ID of the booking account

  // subject = expense sender (Person)
  public subjectKey = '';
  public subjectName = '';
  public subjectModelType? = ModelType.Person;
  public subjectBexioId = ''; // Bexio ID of the subject
  public subjectIban = ''; // IBAN of the subject

  // object = expense receiver (Org) meine Org
  public objectKey = '';
  public objectModelType? = ModelType.Org;
  public objectBexioId = ''; // Bexio ID of the object

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExpenseCollection = 'expenses';
