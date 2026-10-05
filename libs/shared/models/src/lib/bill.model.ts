import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE, DEFAULT_URL } from '@okr/shared-constants';
import { OkrModel, SearchableModel, TaggedModel } from './base.model';
import { MoneyModel } from './money.model';
import { AvatarInfo } from './avatar-info';

/**
 * Bill = Lieferantenrechnung (Kreditor) in Bexio
 */
export class BillModel implements OkrModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES; // a detailed description of the bill

  public title = DEFAULT_TITLE; // title
  public billId = DEFAULT_ID; // Rechnungsnummer (document_no from Bexio)
  public billDate = DEFAULT_DATE; // Rechnungsdatum
  public dueDate = DEFAULT_DATE; // Gültig bis
  public state: 'draft' | 'todo' | 'paid' | 'overdue' = 'draft';

  public totalAmount: MoneyModel | undefined; // total amount in cents


  public paymentDate = DEFAULT_DATE; // Datum der Zahlung
  public bexioUrl = DEFAULT_URL; // URL to bexio invoice
  public attachments: string[] = []; // finance-documents okeys ('bexio-file-…', spec 1.68); legacy: bexio file UUIDs
  public payments: BillPayment[] = []; // outgoing payments, oldest first
  public bookingAccount: string = '';  // migrated bexio bills: comma-separated account okeys; native bills use `lines`
  public lines: BillLine[] = [];       // native bill lines (spec 1.85 Q2); [] on migrated bills
  public paymentReference = '';        // creditor reference (QRR/SCOR) from the QR-bill, normalized (spec 1.85)
  public creditorIban = '';            // the vendor's IBAN from the QR-bill (spec 1.85)
  public bookingKeys: string[] = [];  // the bexio journal bookings of the bill (one per bill line), linked by scripts/link-bexio-ledger.mjs; [] = not linked

  // bill sender (person or org) Rechnungssteller
  public vendor: AvatarInfo | undefined;

  public accountingTenantId = '';   // = org.okey of the accounting tenant

  // Stamped (StoreDateTime) when a data-subject erasure pseudonymized this record
  // (privacy 1.19, D-P5-6): the name fields and the person link are overwritten, the
  // amounts, dates and document references stay. '' = never anonymized.
  public anonymizedAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const BillCollection = 'bills';
export const BillModelName = 'bill';

/** An outgoing payment of a bill. date = execution date (StoreDate), amount in Rappen, type = bexio payment_type
 *  or 'MANUAL' (recorded in okr, spec 1.85). bookingKey = the booking that paid it (a bexio journal row linked by
 *  scripts/link-bexio-ledger.mjs, or one linked/posted by recordBillPayment); '' or absent = not linked.
 *  bankAccountKey = the account the payment left from (recordBillPayment, mode post). */
export interface BillPayment { date: string; amount: number; type: string; bookingKey?: string; bankAccountKey?: string; }

/** One line of a native bill (spec 1.85 Q2): booked as a debit on `accountKey`. amount in Rappen, gross. */
export interface BillLine {
  title: string;
  accountKey: string;      // leaf expense/asset account okey
  amount: number;          // Rappen, > 0
  vatCodeKey: string;      // '' = none
  costCenterKey: string;   // '' = account default
}
