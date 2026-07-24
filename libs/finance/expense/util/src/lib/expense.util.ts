import { hasRole } from '@okr/shared-util-core';
import { ExpenseDocumentModel, ExpenseModel, UserModel } from '@okr/shared-models';

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
