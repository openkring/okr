/** One further part of a split assignment; `amount` is a positive magnitude in minor units. */
export interface SplitDoc { title: string; accountKey: string; vatCodeKey?: string; amount: number; }

export interface RowDoc {
  importKey: string; date: string; rawText: string; payee: string;
  title: string; accountKey: string; vatCodeKey: string;
  splits?: SplitDoc[] | null;                         // further parts; absent on rows from before splits
  amount: { amount: number; currency: string };       // GROSS when the format states a fee
  fee?: { amount: number; currency: string } | null;  // payment-processor fee (spec 1.62 §5)
  amountFx?: { amount: number; currency: string } | null;
  status: string; bankProfileKey: string; accountingTenantId: string; tenants: string[];
  ruleKey?: string;
}
export interface ProfileDoc { accountKey: string; feeAccountKey?: string; accountingTenantId: string; isArchived?: boolean; }

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

/** The processor fee of a row, as a magnitude in minor units; 0 when the format states none. */
export function feeAmountOf(row: RowDoc): number {
  return Math.abs(row.fee?.amount ?? 0);
}

/** The row's further parts; `[]` for a plain one-account assignment and for legacy rows. */
export function splitsOf(row: RowDoc): SplitDoc[] {
  return Array.isArray(row.splits) ? row.splits : [];
}

/**
 * The magnitude left for the main part (row.accountKey) after the further parts, in minor units.
 * Parts split the GROSS amount: the fee comes off the bank side, never off a counter-account.
 */
export function mainPartAmountOf(row: RowDoc): number {
  return Math.abs(row.amount.amount) - splitsOf(row).reduce((sum, s) => sum + (s.amount || 0), 0);
}

/**
 * A split is postable when every part has text, a counter-account and a positive whole amount,
 * and the main part keeps a positive rest — otherwise the booking would not match the bank line.
 */
export function isValidSplit(row: RowDoc): boolean {
  const parts = splitsOf(row);
  if (parts.length === 0) return true;
  return parts.every(s => !!(s.title ?? '').trim() && !!s.accountKey && Number.isInteger(s.amount) && s.amount > 0)
    && mainPartAmountOf(row) > 0;
}

/** A fee only becomes its own line when the profile names an account to book it to (spec 1.62 §5). */
export function hasFeeLine(row: RowDoc, profile: ProfileDoc): boolean {
  return feeAmountOf(row) > 0 && !!profile.feeAccountKey;
}

/**
 * Gutschrift (amount > 0): bank account debit / counter-account credit.
 * Lastschrift (amount < 0): counter-account debit / bank account credit.
 * VAT code only on the counter line; amountFx on both.
 *
 * With a split assignment the single counter line becomes one line per part: the main part
 * (row.accountKey, the rest of the amount) first, then the further parts in form order. Every
 * counter line carries its Buchungstext as `description`; amountFx is left off the counter lines
 * then, because the bank file states no foreign amount per part.
 *
 * With a processor fee (RaiseNow, spec 1.62 §5) a THIRD line is added and the bank/clearing line
 * carries the NET amount, while the counter-account keeps the gross:
 *   Soll  clearing account   amount − fee
 *   Soll  fee account        fee
 *   Haben counter-account    amount
 * A negative amount (refund) mirrors all three. Without a fee — every other format — this returns the
 * same two lines it always did.
 */
export function buildBankBookingLines(row: RowDoc, profile: ProfileDoc, tenantId: string, bookingKey: string): Record<string, unknown>[] {
  const gross = Math.abs(row.amount.amount);
  const feeAmount = hasFeeLine(row, profile) ? feeAmountOf(row) : 0;
  const currency = row.amount.currency;
  const amt = money(gross, currency);
  const net = money(gross - feeAmount, currency);
  const fx = row.amountFx ? { amountFx: money(row.amountFx.amount, row.amountFx.currency) } : {};
  const base = { tenants: [tenantId], isArchived: false, bookingKey, accountingTenantId: row.accountingTenantId };
  const vat = row.vatCodeKey ? { vatCodeKey: row.vatCodeKey } : {};
  const counterDebit = row.amount.amount < 0;
  const side = (m: ReturnType<typeof money>) => counterDebit ? { debitAmount: m } : { creditAmount: m };
  const parts = splitsOf(row);
  const counters = parts.length === 0
    ? [{ ...base, accountKey: row.accountKey, ...side(amt), ...fx, ...vat }]
    : [
        { ...base, accountKey: row.accountKey, ...side(money(mainPartAmountOf(row), currency)), ...vat, description: row.title },
        ...parts.map(s => ({ ...base, accountKey: s.accountKey, ...side(money(s.amount, currency)),
          ...(s.vatCodeKey ? { vatCodeKey: s.vatCodeKey } : {}), description: s.title })),
      ];
  const bank = { ...base, accountKey: profile.accountKey, ...(counterDebit ? { creditAmount: net } : { debitAmount: net }), ...fx };
  if (feeAmount === 0) return counterDebit ? [...counters, bank] : [bank, ...counters];
  const fee = { ...base, accountKey: profile.feeAccountKey as string, ...(counterDebit ? { creditAmount: money(feeAmount, currency) } : { debitAmount: money(feeAmount, currency) }) };
  return counterDebit ? [...counters, bank, fee] : [bank, fee, ...counters];
}

/** Base main name of a split booking when the caller sends none. */
export const DEFAULT_SPLIT_TITLE = 'Sammelbuchung';

/**
 * The header of a bank booking. A split row's own Buchungstext belongs to its first part (the main
 * counter line carries it as `description`), so the booking itself gets the split main name:
 * 'Sammelbuchung · <payee>' (same format as `splitBookingTitle` in @okr/finance-booking-util).
 */
export function buildBankBookingHeader(row: RowDoc, tenantId: string, periodKey: string, splitTitle = DEFAULT_SPLIT_TITLE): Record<string, unknown> {
  const payee = (row.payee ?? '').trim();
  const base = splitTitle.trim() || DEFAULT_SPLIT_TITLE;
  const title = splitsOf(row).length === 0 ? row.title : (payee ? `${base} · ${payee}` : base);
  return {
    title, date: row.date, notes: row.rawText, periodKey, documentKey: '', tags: 'bank-import', index: '',
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

/**
 * Kostenstelle per line of a bank booking (spec 1.65 §6.2): the bank rule's key applies to the main
 * counter-account line only; split parts, fee and bank lines get their account default via `keyFor`
 * (which returns '' for balance-sheet accounts). An empty key writes no field.
 * A split part on the same account as the main part also receives the rule key (accepted).
 */
export function withCostCenterKeys(
  lines: Record<string, unknown>[], row: RowDoc, ruleCostCenterKey: string,
  keyFor: (accountKey: string, rule: string) => string,
): Record<string, unknown>[] {
  return lines.map(line => {
    const accountKey = line['accountKey'] as string;
    const key = keyFor(accountKey, accountKey === row.accountKey ? ruleCostCenterKey : '');
    return key ? { ...line, costCenterKey: key } : line;
  });
}
