import { AccountModel, BillModel, BookingLineModel, BookingModel, BudgetLineModel, BudgetVersionModel, ExpenseModel, InvoiceModel, PaymentOrderModel, PeriodModel } from '@okr/shared-models';
import { isOverdueBill, isPayableBill } from '@okr/finance-bill-util';
import { isOverdueInvoice } from '@okr/finance-invoice-util';
import { accountClass, billOpenAmountAt, DebitCredit, fiscalYearOf, invoiceOpenAmountAt, sumLinesByAccount } from '@okr/finance-reporting-util';
import { newestApprovedBudget, usedPercent } from '@okr/finance-budget-util';

/** Accounting overview (spec 1.100 §4.4) — pure parts, amounts in minor units (Rappen). */

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Flüssige Mittel: Swiss KMU group 10 (Kasse, Post, Bank). */
export function isCashAccount(account: AccountModel): boolean {
  return (account.id ?? '').trim().startsWith('10');
}

export interface OverviewTodos {
  bookingsForReview: number | undefined;
  billsOpen: number;
  billsOverdue: number;
  paymentOrdersReady: number;
  invoicesOverdue: number;
  expensesOpen: number;
  bankRowsOpen: number | undefined;
  /** open Debitoren / Kreditoren today, from the documents (shown as a key figure) */
  openTotals: { payables: number; receivables: number };
}

export interface TodoInput {
  bills: BillModel[];
  paymentOrders: PaymentOrderModel[];
  invoices: InvoiceModel[];
  expenses: ExpenseModel[];
  today: string;
}

export function summarizeTodos(input: TodoInput): Omit<OverviewTodos, 'bookingsForReview' | 'bankRowsOpen' | 'openTotals'> {
  const { bills, paymentOrders, invoices, expenses, today } = input;
  const openBills = bills.filter(b => isPayableBill(b) && billOpenAmountAt(b, today) > 0);
  return {
    billsOpen: openBills.length,
    billsOverdue: openBills.filter(b => isOverdueBill(b, today)).length,
    paymentOrdersReady: paymentOrders.filter(o => o.status === 'draft' || o.status === 'approved').length,
    invoicesOverdue: invoices.filter(i => isOverdueInvoice(i, today)).length,
    expensesOpen: expenses.filter(e => e.status === 'draft' || e.status === 'processing').length,
  };
}

/** The monthly period containing `today`, else the annual period of its fiscal year. */
export function currentPeriod(periods: PeriodModel[], today: string, fiscalYearStart: number): PeriodModel | undefined {
  const fy = fiscalYearOf(today, fiscalYearStart);
  const month = Number(today.slice(4, 6));
  const ofYear = periods.filter(p => p.year === fy && p.isArchived !== true);
  return ofYear.find(p => p.month === month) ?? ofYear.find(p => p.month === 0);
}

export interface KeyFigureInput {
  accounts: AccountModel[];
  bookings: BookingModel[];
  lines: BookingLineModel[];
  from: string;
  to: string;
  budgetVersions: BudgetVersionModel[];
  budgetLines: BudgetLineModel[];
  fiscalYear: number;
}

export interface KeyFigures {
  liquidityChange: number;
  result: number;
  expenseActual: number;
  budgetUsedPercent: number | undefined;
}

function idsByKey(accounts: AccountModel[]): Map<string, AccountModel> {
  return new Map(accounts.map(a => [a.okey, a]));
}

function sumWhere(sums: Map<string, DebitCredit>, accounts: Map<string, AccountModel>, pick: (a: AccountModel) => boolean, sign: (dc: DebitCredit) => number): number {
  let total = 0;
  for (const [key, dc] of sums) {
    const a = accounts.get(key);
    if (a && pick(a)) total += sign(dc);
  }
  return total;
}

/** Key figures of one fiscal year: change in cash, result (Ertrag + 7–9 − Aufwand), budget used. */
export function computeKeyFigures(input: KeyFigureInput): KeyFigures {
  const accounts = idsByKey(input.accounts);
  const sums = sumLinesByAccount(input.lines, input.bookings, input.from, input.to);
  const isPnl = (a: AccountModel) => ['revenue', 'expense', 'result'].includes(accountClass(a.id));
  const isExpense = (a: AccountModel) => accountClass(a.id) === 'expense';
  const expenseActual = sumWhere(sums, accounts, isExpense, dc => dc.debit - dc.credit);
  const version = newestApprovedBudget(input.budgetVersions, input.fiscalYear);
  const budget = version
    ? input.budgetLines
      .filter(l => l.versionKey === version.okey && l.isArchived !== true)
      .filter(l => { const a = accounts.get(l.accountKey); return !!a && isExpense(a); })
      .reduce((s, l) => s + (l.amount?.amount ?? 0), 0)
    : 0;
  return {
    liquidityChange: sumWhere(sums, accounts, isCashAccount, dc => dc.debit - dc.credit),
    result: sumWhere(sums, accounts, isPnl, dc => dc.credit - dc.debit),
    expenseActual,
    budgetUsedPercent: version ? usedPercent(expenseActual, budget) : undefined,
  };
}

/** Cash on hand: posted cash lines since the ledger's start (continuous ledger, no opening entries). */
export function liquidityBalance(lines: BookingLineModel[], bookings: BookingModel[], accounts: AccountModel[]): number {
  const byKey = idsByKey(accounts);
  return sumWhere(sumLinesByAccount(lines, bookings, '', ''), byKey, isCashAccount, dc => dc.debit - dc.credit);
}

const NOT_OPEN_INVOICE = ['draft', 'issuing', 'cancelled'];

/** Open Kreditoren and Debitoren at `today`, from the documents (no ledger read). */
export function openTotals(bills: BillModel[], invoices: InvoiceModel[], today: string): { payables: number; receivables: number } {
  return {
    payables: bills.filter(b => b.state !== 'draft').reduce((s, b) => s + billOpenAmountAt(b, today), 0),
    receivables: invoices.filter(i => !NOT_OPEN_INVOICE.includes(i.state)).reduce((s, i) => s + invoiceOpenAmountAt(i, today), 0),
  };
}

export function fiscalYearOptions(current: number, count = 5): number[] {
  return Array.from({ length: count }, (_, i) => current - i);
}
