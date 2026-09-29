import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE, DEFAULT_URL } from '@okr/shared-constants';
import { AvatarInfo, MoneyModel } from '@okr/shared-models';

import { OkrModel, SearchableModel, TaggedModel } from './base.model';

/**
 * Invoice = Kundenrechnung (Debitor) in Bexio
 */
export class InvoiceModel implements OkrModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES; // a detailed description of the invoice

  public title = DEFAULT_TITLE;
  public invoiceId = DEFAULT_ID; // Rechnungsnummer
  public invoiceDate = DEFAULT_DATE; // Rechnungsdatum
  public dueDate = DEFAULT_DATE; // Zahlungsdatum

  public totalAmount: MoneyModel | undefined;
  public taxes = 0; // total taxes
  public vatType: VAT_TYPE = 'exempt';  
  public state = 'created'; // Category invoice_state
  public paymentDate = DEFAULT_DATE; // Datum der Zahlung
  // booking-account is on the invoice position

  // invoice receiver (Person or Org) Rechnungsempfänger
  public receiver: AvatarInfo | undefined;

  public accountingTenantId = '';   // = org.okey of the accounting tenant
  public invoiceNo = 0;             // sequential per fiscal year + accountingTenantId
  public bookingKey = '';           // ref to BookingModel; set when invoice is paid
  public documentKey = '';          // the invoice PDF (finance-documents okey, spec 1.68)
  public payments: InvoicePayment[] = [];   // received payments, oldest first
  public reminders: InvoiceReminder[] = []; // Mahnungen, oldest first

  // Stamped (StoreDateTime) when a data-subject erasure pseudonymized this record
  // (privacy 1.19, D-P5-6): the name fields and the person link are overwritten, the
  // amounts, dates and document references stay. '' = never anonymized.
  public anonymizedAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvoiceCollection = 'invoices';
export const InvoiceModelName = 'invoice';


export type VAT_TYPE = 'included' | 'excluded' | 'exempt';

/** A payment received on an invoice. date = StoreDate, amount in Rappen, bankAccountKey = AccountModel okey or ''. */
export interface InvoicePayment { date: string; amount: number; bankAccountKey: string; }

/** A reminder (Mahnung). date/dueDate = StoreDate, documentKey = its PDF in finance-documents or ''. */
export interface InvoiceReminder { level: number; date: string; dueDate: string; isSent: boolean; documentKey: string; }
export const VAT_TYPE_VALUES = ['included', 'excluded', 'exempt'] as const satisfies VAT_TYPE[];