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
  public paymentReference = '';     // QRR (27 digits) from invoiceNo, spec 1.2; '' = bexio/migrated, slip without reference
  public bookingKey = '';           // the issue booking (BookingModel okey `invoice-{key}`); '' = bexio/migrated
  public bookingKeys: string[] = [];  // bexio/migrated only: the bexio journal bookings of the invoice (one per invoice line), linked by scripts/link-bexio-ledger.mjs
  public documentKey = '';          // the invoice PDF (finance-documents okey, spec 1.68)
  public payments: InvoicePayment[] = [];   // received payments, oldest first
  public reminders: InvoiceReminder[] = []; // Mahnungen, oldest first
  public sentAt = '';               // StoreDate (yyyyMMdd) of the last send of the invoice PDF (email or post, see sentVia); '' = never (spec 1.76 D13)
  public sentVia: InvoiceSentVia | '' = '';  // how the invoice was sent: 'email' (sendInvoiceEmail) or 'post' (marked by hand); '' = unknown / not sent

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

/** A payment received on an invoice. date = StoreDate, amount in Rappen, bankAccountKey = AccountModel okey or ''.
 *  bookingKey = the booking that settled it (posted by recordInvoicePayment, or linked; a numeric bexio journal row id for a migrated payment); '' = not linked. */
/** How an issued invoice reached its receiver. */
export type InvoiceSentVia = 'email' | 'post';

export interface InvoicePayment { date: string; amount: number; bankAccountKey: string; bookingKey: string; }

/** A reminder (Mahnung). date/dueDate = StoreDate, documentKey = its PDF in finance-documents or ''. */
export interface InvoiceReminder { level: number; date: string; dueDate: string; isSent: boolean; documentKey: string;
  fee: number;         // Rappen charged with this reminder; 0 = none / migrated (spec 1.76 D14)
  bookingKey: string;  // fee booking `invoice-{key}-reminder-{level}`; '' = no fee booked (spec 1.76 D14)
  waivedAt: string;        // StoreDate of the fee waiver; '' = not waived (spec 1.76 D18)
  waiveBookingKey: string; // waiver booking `invoice-{key}-reminder-{level}-waiver`; '' = not waived (spec 1.76 D18)
}
export const VAT_TYPE_VALUES = ['included', 'excluded', 'exempt'] as const satisfies VAT_TYPE[];