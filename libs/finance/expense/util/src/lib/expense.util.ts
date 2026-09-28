import { hasRole, SwissQrBill } from '@okr/shared-util-core';
import {
  CategoryItemModel, CategoryListModel, ExpenseDocumentModel, ExpenseModel, ExpenseStatus, ExpenseTransferTo, UserModel,
} from '@okr/shared-models';

export const ALLOWED_CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP'] as const;
export type AllowedCurrency = (typeof ALLOWED_CURRENCIES)[number];

export function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase();
}

export function chfToCents(chf: number): number {
  return Math.round(chf * 100);
}

export function centsToCHF(cents: number): number {
  return cents / 100;
}

/** A receipt file uploaded for an expense, read straight from Firebase Storage. */
export interface ExpenseReceipt {
  name: string;
  /** Firebase download url (tokenized) — for download and copy */
  url: string;
  /** the Storage path, tenant/{tenantId}/ocr/expense/{expenseKey}/{name} — for the imgix thumbnail */
  path: string;
  contentType: string;
}

/** A Swiss QR-bill found on a receipt (ocr-results.qrBill), ready to render. */
export interface ExpenseQrBill {
  receiptName: string;
  /** the QR code, re-rendered from the stored payload, as a data url */
  qrCode: string;
  bill: SwissQrBill;
}

export function newExpenseModel(tenantId: string, userId: string, accountingTenantId: string): ExpenseModel {
  const m = new ExpenseModel(tenantId);
  m.userId = userId;
  m.accountingTenantId = accountingTenantId;
  m.status = 'draft';
  return m;
}

export function newExpenseDocumentModel(tenantId: string, expenseKey: string, documentKey: string): ExpenseDocumentModel {
  const m = new ExpenseDocumentModel(tenantId);
  m.expenseKey = expenseKey;
  m.documentKey = documentKey;
  m.ocrStatus = 'pending';
  return m;
}

const isAuthor    = (e: ExpenseModel, u?: UserModel): boolean => !!u && e.userId === u.okey;
const isTreasurer = (u?: UserModel): boolean => hasRole('treasurer', u);

/** View/edit the expense detail: author or treasurer. */
export const canViewExpense   = (e: ExpenseModel, u?: UserModel): boolean => isAuthor(e, u) || isTreasurer(u);
/** Soft-delete: author or treasurer. */
export const canDeleteExpense = (e: ExpenseModel, u?: UserModel): boolean => isAuthor(e, u) || isTreasurer(u);
/** Redo OCR: treasurer only, and only while not yet booked. */
export const canRedoOcr       = (e: ExpenseModel, u?: UserModel): boolean => isTreasurer(u) && !e.bookingKey;
/** Open the linked review task: viewer with a task link. */
export const canOpenTask      = (e: ExpenseModel, u?: UserModel): boolean => (isAuthor(e, u) || isTreasurer(u)) && !!e.taskKey;
/** Open the linked booking: viewer with a booking link. */
export const canOpenBooking   = (e: ExpenseModel, u?: UserModel): boolean => (isAuthor(e, u) || isTreasurer(u)) && !!e.bookingKey;

/**
 * Change an expense (including its status): treasurer or admin. NOT the author — a member may
 * submit and delete their own expense, but moving it through the lifecycle is the treasurer's job.
 */
export const canEditExpense = (e: ExpenseModel, u?: UserModel): boolean => isTreasurer(u);

// ---------------------------------------------------------------------------
// List: filtering, sorting and the two dropdown filters
// ---------------------------------------------------------------------------

/** The columns the expense list can be sorted by (list header click). */
export type ExpenseSortField = 'name' | 'date' | 'amount';

export interface ExpenseFilter {
  searchTerm: string;
  /** 'all' or an ExpenseStatus */
  status: string;
  /** 'all' or an ExpenseTransferTo */
  transferTo: string;
}

/** The status category in the `categories` collection (tenants ['system']). */
export const EXPENSE_STATE_CATEGORY_NAME = 'expense_state';
export const EXPENSE_TRANSFER_CATEGORY_NAME = 'expense_transfer';

/** The i18n scope of the expense feature; the filter categories translate their items from it. */
const EXPENSE_I18N_SCOPE = '@finance/expense/feature';

/**
 * The statuses a treasurer may set BY HAND in the edit modal: every `ExpenseStatus` except
 * `draft`, which is written only by `newExpenseModel` before the expense exists server-side.
 * `VALID_STATUS` in the `updateExpense` callable mirrors this list — the UI is not the
 * security boundary.
 */
export const EXPENSE_EDIT_STATES: ExpenseStatus[] = ['processing', 'done', 'cancelled'];

const EXPENSE_TRANSFERS: ExpenseTransferTo[] = ['me', 'issuer'];

/**
 * The status picker of the treasurer edit modal: the `expense_state` category from the
 * `categories` collection (labels, icons and colours are DB-owned), narrowed to the
 * hand-settable items. The item NAMES are fixed — the Cloud Functions write them.
 */
export function getExpenseEditStateCategory(stateCategory: CategoryListModel): CategoryListModel {
  return { ...stateCategory, items: stateCategory.items.filter(i => EXPENSE_EDIT_STATES.includes(i.name as ExpenseStatus)) };
}

/**
 * The transferTo filter of the expense list ('all' is prepended by okr-cat-select). Code-owned:
 * transferTo is a two-value union type in the model. `translateItems` makes okr-cat-select
 * resolve each item through `@finance/expense/feature.expense_transfer.<item>.label`.
 */
export function getExpenseTransferCategory(tenantId: string): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.name = EXPENSE_TRANSFER_CATEGORY_NAME;
  category.i18n = EXPENSE_I18N_SCOPE;
  category.translateItems = true;
  category.items = EXPENSE_TRANSFERS.map(item => new CategoryItemModel(item, ''));
  return category;
}

/**
 * The colour of a status icon in the list: done green, cancelled red, processing orange, draft
 * blue, anything else (a legacy value) in the text colour — black in light mode, and still
 * visible in dark mode. Code-owned on purpose: the colour carries the meaning of the item NAME,
 * which is fixed, while its label and icon come from the DB category.
 */
export function expenseStatusColor(status: string | undefined): string {
  switch (status) {
    case 'done':       return 'var(--ion-color-success)';
    case 'cancelled':  return 'var(--ion-color-danger)';
    case 'processing': return 'var(--ion-color-warning)';
    case 'draft':      return '#1e6fd9';
    default:           return 'var(--ion-text-color)';
  }
}

/** The click-through status filter: 'all' → each item of the category in turn → 'all'. */
export function nextExpenseStateFilter(current: string, stateNames: string[]): string {
  const cycle = ['all', ...stateNames];
  const i = Math.max(cycle.indexOf(current), 0);   // an unknown value counts as 'all'
  return cycle[(i + 1) % cycle.length];
}

/** Search matches the subject and the submitter's name; '' / 'all' disable a filter. */
export function filterExpenses(expenses: ExpenseModel[], filter: ExpenseFilter): ExpenseModel[] {
  const term = filter.searchTerm.trim().toLowerCase();
  return expenses.filter(e => {
    if (filter.status !== 'all' && filter.status !== '' && e.status !== filter.status) return false;
    if (filter.transferTo !== 'all' && filter.transferTo !== '' && e.transferTo !== filter.transferTo) return false;
    if (term.length === 0) return true;
    return `${e.abstract} ${e.userName}`.toLowerCase().includes(term);
  });
}

/**
 * Sort a copy of the list. `diff` is always the DESCENDING comparator (newest / biggest / Z→A
 * first); `ascending` flips it, for text and numbers alike.
 */
export function sortExpenses(expenses: ExpenseModel[], field: ExpenseSortField, ascending: boolean): ExpenseModel[] {
  return [...expenses].sort((a, b) => {
    let diff: number;
    switch (field) {
      case 'name':   diff = (b.userName ?? '').localeCompare(a.userName ?? ''); break;
      case 'amount': diff = b.amountTotal - a.amountTotal; break;
      // creationDateTime is a StoreDateTime (yyyyMMddHHmmss) — lexicographic order IS chronological
      default:       diff = (b.creationDateTime ?? '').localeCompare(a.creationDateTime ?? '');
    }
    return ascending ? -diff : diff;
  });
}
