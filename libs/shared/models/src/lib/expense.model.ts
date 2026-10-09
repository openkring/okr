import { DEFAULT_CURRENCY, DEFAULT_DATETIME, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel, SearchableModel, TaggedModel } from './base.model';

// The four item names of the `expense_state` category (categories collection, tenants ['system']).
// The names are fixed because the Cloud Functions write them; labels/icons live in the DB.
// 'draft'      = not yet submitted (client-side model factory only).
// 'processing' = submitted; OCR, booking and the treasurer review run. A failed OCR keeps the
//                expense here and sets `ocrError` — a flag, not a state.
// 'done'       = settled: the booking was approved, or the treasurer closed the review task.
// 'cancelled'  = rejected: the booking was rejected, or the treasurer cancelled it by hand.
export type ExpenseStatus = 'draft' | 'processing' | 'done' | 'cancelled';

/**
 * Where the reimbursement is paid: 'me' = to the employee (needs an IBAN), 'issuer' = to the invoice issuer,
 * 'member' = to another member, entered by a treasurer on their behalf (a receipt that reached the treasurer
 * by email or post). For 'member', `payeeKey`/`payeeName` name that member and `iban` is their favorite bank
 * account, all stamped by createExpense; `userId`/`userName`/`personKey` stay the treasurer who entered it.
 */
export type ExpenseTransferTo = 'me' | 'issuer' | 'member';

export class ExpenseModel implements OkrModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;
  public creationDateTime = DEFAULT_DATETIME; // StoreDateTime (yyyyMMddHHmmss); set server-side by createExpense CF. Sortable lexicographically for newest-first ordering.

  public abstract = '';
  public amountTotal = 0;
  public currency = DEFAULT_CURRENCY;
  public transferTo: ExpenseTransferTo = 'me';
  public iban = '';
  // transferTo 'member' only: the member who is reimbursed (FK → persons) and their display name,
  // stamped by createExpense. '' for 'me'/'issuer' (the payee is then the submitter or the issuer).
  public payeeKey = '';
  public payeeName = '';
  public accountKey = '';        // FK → accounts; the expense account (Aufwandskonto), '' = not chosen yet
  public costCenterId = '';     // CostCenterModel okey (spec 1.65 D16; was free text)
  public projectKey = '';       // FK → projects; Kostenträger of the expense line (spec 3.14 D8), '' = ohne Projekt
  public note = '';
  public status: ExpenseStatus = 'draft';
  public bookingKey = '';
  public taskKey = DEFAULT_KEY;   // FK → tasks; the OCR review task for this expense (set by the OCR pipeline)
  public userId = DEFAULT_KEY;
  public userName = '';           // submitter's display name, stamped by the createExpense CF (legacy docs: '')
  // FK → persons. The expense used to carry only userId (a `users` doc id); `users` is not
  // tenant-readable, so no client could resolve uid → person. Stamped by createExpense from
  // users/{uid}.personKey; '' on legacy documents and when the user has no person link.
  public personKey = DEFAULT_KEY;
  public accountingTenantId = '';
  public receiptCount = 0; // number of receipt files uploaded to the OCR pipeline; lets stage ② know when all receipts are in

  // Latest OCR failure (spec 2026-09-02-expense-workflow-design §3.5). '' = no failure on record.
  // The expense stays 'processing'; cleared by redoExpenseOcr or when the treasurer settles it.
  public ocrError = '';
  public ocrErrorAt = '';         // StoreDateTime of that failure, so a retry supersedes it visibly

  // Stamped (StoreDateTime) when a data-subject erasure pseudonymized this record
  // (privacy 1.19, D-P5-6): the name fields and the person link are overwritten, the
  // amounts, dates and document references stay. '' = never anonymized.
  public anonymizedAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExpenseCollection = 'expenses';
export const ExpenseModelName = 'expense';
