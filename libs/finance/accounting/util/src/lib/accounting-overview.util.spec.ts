import { describe, expect, it } from 'vitest';

import { AccountModel, BillModel, BookingLineModel, BookingModel, BudgetLineModel, BudgetVersionModel, ExpenseModel, InvoiceModel, MoneyModel, PaymentOrderModel, PeriodModel } from '@okr/shared-models';

import { chunk, computeKeyFigures, currentPeriod, fiscalYearOptions, isCashAccount, liquidityBalance, openTotals, summarizeTodos } from './accounting-overview.util';

const account = (okey: string, id: string) => Object.assign(new AccountModel('scs'), { okey, id });
const booking = (okey: string, date: string, status = 'posted') => Object.assign(new BookingModel('scs', 'scs'), { okey, date, status });
const line = (bookingKey: string, accountKey: string, debit: number, credit: number) =>
  Object.assign(new BookingLineModel('scs', 'scs'), { bookingKey, accountKey, debitAmount: new MoneyModel(debit, 'CHF'), creditAmount: new MoneyModel(credit, 'CHF') });

const accounts = [account('a1020', '1020'), account('a1100', '1100'), account('a3000', '3000'), account('a6000', '6000'), account('a8000', '8000')];

describe('chunk', () => {
  it('splits into pieces of size n', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 15)).toEqual([]);
  });
});

describe('isCashAccount', () => {
  it('is class 10 (Flüssige Mittel)', () => {
    expect(isCashAccount(account('x', '1020'))).toBe(true);
    expect(isCashAccount(account('x', '1100'))).toBe(false);
    expect(isCashAccount(account('x', ' 1000 '))).toBe(true);
  });
});

describe('summarizeTodos', () => {
  const today = '20261013';
  it('counts open and overdue bills, ready payment orders, overdue invoices and open expenses', () => {
    const bills = [
      Object.assign(new BillModel('scs'), { okey: 'b1', billDate: '20260901', state: 'todo', dueDate: '20261001', totalAmount: new MoneyModel(1000, 'CHF') }),
      Object.assign(new BillModel('scs'), { okey: 'b2', billDate: '20261001', state: 'todo', dueDate: '20261101', totalAmount: new MoneyModel(500, 'CHF') }),
      Object.assign(new BillModel('scs'), { okey: 'b3', billDate: '20260901', state: 'draft', dueDate: '20261001' }),
      Object.assign(new BillModel('scs'), { okey: 'b4', billDate: '20260901', state: 'paid', dueDate: '20261001' }),
    ];
    const orders = ['draft', 'approved', 'transmitted'].map(status => Object.assign(new PaymentOrderModel('scs', 'scs'), { status }));
    const invoices = [
      Object.assign(new InvoiceModel('scs'), { state: 'overdue', dueDate: '20261001' }),
      Object.assign(new InvoiceModel('scs'), { state: 'draft', dueDate: '20261001' }),
    ];
    const expenses = ['draft', 'processing', 'done', 'cancelled'].map(status => Object.assign(new ExpenseModel('scs'), { status }));
    const t = summarizeTodos({ bills, paymentOrders: orders, invoices, expenses, today });
    expect(t.billsOverdue).toBe(1);
    expect(t.billsOpen).toBeGreaterThanOrEqual(1);
    expect(t.paymentOrdersReady).toBe(2);
    expect(t.invoicesOverdue).toBe(1);
    expect(t.expensesOpen).toBe(2);
  });
});

describe('currentPeriod', () => {
  const p = (year: number, month: number, isLocked = false) => Object.assign(new PeriodModel('scs', 'scs'), { year, month, isLocked });
  it('prefers the monthly period of today', () => {
    expect(currentPeriod([p(2026, 0), p(2026, 10)], '20261013', 1)).toMatchObject({ year: 2026, month: 10 });
  });
  it('falls back to the annual period of the fiscal year', () => {
    expect(currentPeriod([p(2026, 0)], '20261013', 1)).toMatchObject({ year: 2026, month: 0 });
    expect(currentPeriod([p(2025, 0)], '20260313', 7)).toMatchObject({ year: 2025, month: 0 });
  });
  it('is undefined without a period', () => {
    expect(currentPeriod([], '20261013', 1)).toBeUndefined();
  });
});

describe('computeKeyFigures', () => {
  const bookings = [booking('k1', '20260210'), booking('k2', '20260315'), booking('k3', '20260320', 'forReview')];
  const lines = [
    line('k1', 'a1020', 10000, 0), line('k1', 'a3000', 0, 10000),   // revenue 100.00 into the bank
    line('k2', 'a6000', 4000, 0), line('k2', 'a1020', 0, 4000),     // expense 40.00 from the bank
    line('k3', 'a6000', 9999, 0), line('k3', 'a1020', 0, 9999),     // not posted: ignored
  ];
  it('computes the change in cash, the result and the budget used for the period', () => {
    const version = Object.assign(new BudgetVersionModel('scs', 'scs', 2026), { okey: 'v1', status: 'approved', fiscalYear: 2026, approvedAt: '20251120' });
    const budgetLines = [Object.assign(new BudgetLineModel('scs', 'scs', 'v1'), { versionKey: 'v1', accountKey: 'a6000', amount: new MoneyModel(8000, 'CHF') })];
    const k = computeKeyFigures({ accounts, bookings, lines, from: '20260101', to: '20261231', budgetVersions: [version], budgetLines, fiscalYear: 2026 });
    expect(k.liquidityChange).toBe(6000);
    expect(k.result).toBe(6000);
    expect(k.expenseActual).toBe(4000);
    expect(k.budgetUsedPercent).toBe(50);
  });
  it('has no budget percentage without an approved version', () => {
    const k = computeKeyFigures({ accounts, bookings, lines, from: '20260101', to: '20261231', budgetVersions: [], budgetLines: [], fiscalYear: 2026 });
    expect(k.budgetUsedPercent).toBeUndefined();
  });
});

describe('liquidityBalance', () => {
  it('sums posted cash lines over the whole history', () => {
    const bookings = [booking('k0', '20181231'), booking('k1', '20260210')];
    const lines = [line('k0', 'a1020', 50000, 0), line('k0', 'a8000', 0, 50000), line('k1', 'a1020', 10000, 0), line('k1', 'a3000', 0, 10000)];
    expect(liquidityBalance(lines, bookings, accounts)).toBe(60000);
  });
});

describe('openTotals', () => {
  it('ignores draft bills and draft/issuing/cancelled invoices', () => {
    const bills = [Object.assign(new BillModel('scs'), { okey: 'b', state: 'draft', totalAmount: new MoneyModel(999, 'CHF') })];
    const invoices = [Object.assign(new InvoiceModel('scs'), { okey: 'i', state: 'cancelled' })];
    expect(openTotals(bills, invoices, '20261013')).toEqual({ payables: 0, receivables: 0 });
  });
});

describe('fiscalYearOptions', () => {
  it('lists the current and the four previous years', () => {
    expect(fiscalYearOptions(2026)).toEqual([2026, 2025, 2024, 2023, 2022]);
  });
});
