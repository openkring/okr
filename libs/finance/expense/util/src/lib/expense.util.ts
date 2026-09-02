import { hasRole } from '@okr/shared-util-core';
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

export const EXPENSE_STATE_CATEGORY_NAME = 'expense_state';
export const EXPENSE_TRANSFER_CATEGORY_NAME = 'expense_transfer';

/** The i18n scope of the expense feature; the filter categories translate their items from it. */
const EXPENSE_I18N_SCOPE = '@finance/expense/feature';

const EXPENSE_STATES: ExpenseStatus[] = ['draft', 'processing', 'validated', 'error', 'posted', 'pending-export'];
const EXPENSE_TRANSFERS: ExpenseTransferTo[] = ['me', 'issuer'];

/**
 * Build a CategoryListModel from a fixed item list. Unlike the categories in the `categories`
 * collection these two are code-owned: status and transferTo are union types in the model, so a
 * DB-editable list could drift from what the code accepts. `translateItems` makes okr-cat-select
 * resolve each item through `@finance/expense/feature.<categoryName>.<item>.label`.
 */
function buildExpenseCategory(tenantId: string, name: string, items: readonly string[]): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.name = name;
  category.i18n = EXPENSE_I18N_SCOPE;
  category.translateItems = true;
  category.items = items.map(item => new CategoryItemModel(item, ''));
  return category;
}

/** The status filter of the expense list ('all' is prepended by okr-cat-select). */
export function getExpenseStateCategory(tenantId: string): CategoryListModel {
  return buildExpenseCategory(tenantId, EXPENSE_STATE_CATEGORY_NAME, EXPENSE_STATES);
}

/** The transferTo filter of the expense list ('all' is prepended by okr-cat-select). */
export function getExpenseTransferCategory(tenantId: string): CategoryListModel {
  return buildExpenseCategory(tenantId, EXPENSE_TRANSFER_CATEGORY_NAME, EXPENSE_TRANSFERS);
}

/** Search matches the subject, the submitter's name and the category; '' / 'all' disable a filter. */
export function filterExpenses(expenses: ExpenseModel[], filter: ExpenseFilter): ExpenseModel[] {
  const term = filter.searchTerm.trim().toLowerCase();
  return expenses.filter(e => {
    if (filter.status !== 'all' && filter.status !== '' && e.status !== filter.status) return false;
    if (filter.transferTo !== 'all' && filter.transferTo !== '' && e.transferTo !== filter.transferTo) return false;
    if (term.length === 0) return true;
    return `${e.abstract} ${e.userName} ${e.category}`.toLowerCase().includes(term);
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
