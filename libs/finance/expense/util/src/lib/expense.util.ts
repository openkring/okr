import { ExpenseDocumentModel, ExpenseModel } from '@bk2/shared-models';

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
