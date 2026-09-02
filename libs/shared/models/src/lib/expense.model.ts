import { DEFAULT_CURRENCY, DEFAULT_DATETIME, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel, SearchableModel, TaggedModel } from './base.model';

// 'posted'         = booked in okr's own ledger (native accounting backend).
// 'pending-export' = expense + receipts saved, but the accounting entry is owned by an external
//                    backend (e.g. Bexio); okr does not write a local booking for it.
export type ExpenseStatus = 'draft' | 'processing' | 'validated' | 'error' | 'posted' | 'pending-export';

/** Where the reimbursement is paid: 'me' = to the employee (needs an IBAN), 'issuer' = to the invoice issuer. */
export type ExpenseTransferTo = 'me' | 'issuer';

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
  public category = '';
  public costCenterId = '';
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
  // Written together with status 'error'; cleared by redoExpenseOcr.
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
