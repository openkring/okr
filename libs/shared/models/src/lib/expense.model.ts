import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';

/**
 * Expense = Spesenrechnung
 */
export class ExpenseModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public description = DEFAULT_NOTES;

  public name = DEFAULT_NAME; // title
  public billId = DEFAULT_ID; // Rechnungsnummer
  public paidOnDate = DEFAULT_DATE; // Spesen Rechnung bezahlt
  public expenseDate = DEFAULT_DATE; // Empfangsdatum der Spesenrechnung
  public expensePaidDate = DEFAULT_DATE; // Datum der Rückerstattung der Spesenrechnung
  public dueDate = DEFAULT_DATE; // Zahlungsdatum der Spesenrechnung

  public totalAmount = DEFAULT_PRICE; // total amount
  public currency = DEFAULT_CURRENCY;
  public taxes = 0; // total taxes
  public taxRate = 0; // tax rate in percent
  public isPaid = false; // is the expense paid
  public bookingAccountId = DEFAULT_ID; // Bexio ID of the booking account

  public author?: AvatarInfo;  // expense sender (person)
  // subject = expense sender (Person)
  public authorBexioId = DEFAULT_ID; // Bexio ID of the subject
  public authorIban = ''; // IBAN of the subject

  public org?: AvatarInfo; // expense receiver (default org)
  public orgBexioId = DEFAULT_ID;
  public orgIban = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExpenseCollection = 'expenses';
export const ExpenseModelName = 'expense';
