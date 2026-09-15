export interface RowDoc {
  importKey: string; date: string; rawText: string; payee: string;
  title: string; accountKey: string; vatCodeKey: string;
  amount: { amount: number; currency: string };
  amountFx?: { amount: number; currency: string } | null;
  status: string; bankProfileKey: string; accountingTenantId: string; tenants: string[];
}
export interface ProfileDoc { accountKey: string; accountingTenantId: string; isArchived?: boolean; }

/** Fiscal year containing a StoreDate; `fiscalYearStart` 1..12 (1 = calendar year). */
export function fiscalYear(storeDate: string, fiscalYearStart: number): number {
  const year = Number(storeDate.substring(0, 4));
  const month = Number(storeDate.substring(4, 6));
  return fiscalYearStart > 1 && month < fiscalYearStart ? year - 1 : year;
}

/** PeriodModel okey rule for the annual period (spec 1.60 §7.3). */
export function periodKeyFor(accountingTenantId: string, storeDate: string, fiscalYearStart: number): string {
  return `${accountingTenantId}-${fiscalYear(storeDate, fiscalYearStart)}`;
}

function money(amount: number, currency: string): { amount: number; currency: string; periodicity: 'one-time' } {
  return { amount: Math.abs(amount), currency, periodicity: 'one-time' };
}

/**
 * Gutschrift (amount > 0): bank account debit / counter-account credit.
 * Lastschrift (amount < 0): counter-account debit / bank account credit.
 * VAT code only on the counter line; amountFx on both.
 */
export function buildBankBookingLines(row: RowDoc, profile: ProfileDoc, tenantId: string, bookingKey: string): Record<string, unknown>[] {
  const amt = money(row.amount.amount, row.amount.currency);
  const fx = row.amountFx ? { amountFx: money(row.amountFx.amount, row.amountFx.currency) } : {};
  const base = { tenants: [tenantId], isArchived: false, bookingKey, accountingTenantId: row.accountingTenantId };
  const vat = row.vatCodeKey ? { vatCodeKey: row.vatCodeKey } : {};
  const counterDebit = row.amount.amount < 0;
  const counter = { ...base, accountKey: row.accountKey, ...(counterDebit ? { debitAmount: amt } : { creditAmount: amt }), ...fx, ...vat };
  const bank = { ...base, accountKey: profile.accountKey, ...(counterDebit ? { creditAmount: amt } : { debitAmount: amt }), ...fx };
  return counterDebit ? [counter, bank] : [bank, counter];
}

export function buildBankBookingHeader(row: RowDoc, tenantId: string, periodKey: string): Record<string, unknown> {
  const payee = (row.payee ?? '').trim();
  return {
    title: row.title, date: row.date, notes: row.rawText, periodKey, documentKey: '', tags: 'bank-import', index: '',
    ...(payee ? { counterparty: { key: '', name1: '', name2: payee, modelType: 'org', type: '', subType: '', label: payee } } : {}),
    status: 'posted', accountingTenantId: row.accountingTenantId, tenants: [tenantId], isArchived: false,
  };
}

/*-------------------------- journal import (spec 1.60 §12) --------------------------------*/
export interface JournalEntry {
  id: string; date: string; title: string; reference: string;
  debitAccountKey: string; creditAccountKey: string;
  amount: number; currency: string; amountBase: number; baseCurrency: string;
}

/** Ledger amount = base currency; the booking currency rides along as amountFx when it differs. */
export function buildJournalBookingLines(entry: JournalEntry, tenantId: string, accountingTenantId: string, bookingKey: string): Record<string, unknown>[] {
  const amt = money(entry.amountBase, entry.baseCurrency || 'CHF');
  const fx = entry.currency && entry.currency !== (entry.baseCurrency || 'CHF') ? { amountFx: money(entry.amount, entry.currency) } : {};
  const base = { tenants: [tenantId], isArchived: false, bookingKey, accountingTenantId };
  return [
    { ...base, accountKey: entry.debitAccountKey, debitAmount: amt, ...fx },
    { ...base, accountKey: entry.creditAccountKey, creditAmount: amt, ...fx },
  ];
}

export function buildJournalBookingHeader(entry: JournalEntry, tenantId: string, accountingTenantId: string, periodKey: string, bookingKey: string): Record<string, unknown> {
  const title = (entry.title ?? '').trim() || (entry.reference ?? '').trim() || bookingKey;
  return {
    title, date: entry.date, notes: (entry.reference ?? '').trim(), periodKey, documentKey: '', tags: 'journal-import', index: '',
    status: 'posted', accountingTenantId, tenants: [tenantId], isArchived: false,
  };
}
