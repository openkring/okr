import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE, DEFAULT_URL } from '@bk2/shared-constants';
import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { MoneyModel } from 'libs/shared/models/src/lib/money.model';
import { AvatarInfo } from 'libs/shared/models/src/lib/avatar-info';

/**
 * Bill = Lieferantenrechnung (Kreditor) in Bexio
 */
export class BillModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
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
  public bookingAccountId = DEFAULT_ID; // Bexio ID of the booking account
  public attachments: string[] = []; // uuid's from Bexio
  public bookingAccounts: string[] = [];

  // bill sender (person or org) Rechnungssteller
  public vendor: AvatarInfo | undefined;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const BillCollection = 'bills';
export const BillModelName = 'bill';
