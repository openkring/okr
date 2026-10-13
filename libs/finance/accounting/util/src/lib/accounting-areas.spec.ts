import { describe, expect, it } from 'vitest';

import { ACCOUNTING_AREAS, resolveAccountingArea, segmentUrl } from './accounting-areas';

describe('resolveAccountingArea', () => {
  const cases: [string, string, string, string | undefined][] = [
    ['/accounting/scs/overview', 'overview', 'overview', 'scs'],
    ['/accounting/scs/journal/c-journal', 'journal', 'journal.bookings', 'scs'],
    ['/accounting/gss/journal/c-journal?year=2026&month=3', 'journal', 'journal.bookings', 'gss'],
    ['/accounting-bank-import/gss/bank-import-context', 'journal', 'journal.bankImport', 'gss'],
    ['/accounting/scs/bill/all/c-bill', 'payables', 'payables.bills', 'scs'],
    ['/accounting/scs/payments', 'payables', 'payables.paymentOrders', 'scs'],
    ['/accounting/scs/payments/po-123', 'payables', 'payables.paymentOrders', 'scs'],
    ['/expense/all/c-expense', 'payables', 'payables.expenses', undefined],
    ['/accounting/scs/invoice/all/c-invoice', 'receivables', 'receivables.invoices', 'scs'],
    ['/memberfees/c-memberfees', 'receivables', 'receivables.memberFees', undefined],
    ['/accounting/scs/aging', 'receivables', 'receivables.aging', 'scs'],
    ['/accounting/scs/cost-center/c-cost-center', 'cost', 'cost.costCenters', 'scs'],
    ['/accounting/scs/budget/c-budget', 'cost', 'cost.budgets', 'scs'],
    ['/accounting/scs/budget/version/v1', 'cost', 'cost.budgets', 'scs'],
    ['/accounting/scs/budget/compare', 'cost', 'cost.budgets', 'scs'],
    ['/accounting/scs/allocation/c-allocation', 'cost', 'cost.allocations', 'scs'],
    ['/accounting/scs/balance/c-report', 'reports', 'reports.balance', 'scs'],
    ['/accounting/scs/income-statement/c-report', 'reports', 'reports.incomeStatement', 'scs'],
    ['/accounting/scs/cash-flow', 'reports', 'reports.cashFlow', 'scs'],
    ['/accounting/scs/open-items', 'reports', 'reports.openItems', 'scs'],
    ['/accounting/scs/periods/c-period', 'closing', 'closing.periods', 'scs'],
    ['/accounting/scs/assets', 'closing', 'closing.assets', 'scs'],
    ['/accounting/scs/depreciation-run', 'closing', 'closing.depreciation', 'scs'],
    ['/accounting/scs/account/c-account', 'masterData', 'masterData.accounts', 'scs'],
    ['/accounting/scs/vat-codes', 'masterData', 'masterData.vatCodes', 'scs'],
    ['/accounting-bank-profiles/scs/bank-profile-context', 'masterData', 'masterData.bankProfiles', 'scs'],
    ['/accounting-bank-rules/scs/bank-rule-context', 'masterData', 'masterData.bankRules', 'scs'],
    ['/accounting-ocr-rules/scs/ocr-rule-context', 'masterData', 'masterData.ocrRules', 'scs'],
    ['/accounting/scs/settings', 'masterData', 'masterData.settings', 'scs'],
  ];

  it.each(cases)('%s → %s / %s', (url, areaId, segmentId, books) => {
    const resolved = resolveAccountingArea(url);
    expect(resolved?.area.id).toBe(areaId);
    expect(resolved?.segment.id).toBe(segmentId);
    expect(resolved?.books).toBe(books);
  });

  it('returns undefined outside accounting', () => {
    expect(resolveAccountingArea('/expense/my/c-expense')).toBeUndefined();
    expect(resolveAccountingArea('/my-cost-centers/scs')).toBeUndefined();
    expect(resolveAccountingArea('/my-invoice/scs/c-invoice')).toBeUndefined();
    expect(resolveAccountingArea('/private/welcome')).toBeUndefined();
    expect(resolveAccountingArea('')).toBeUndefined();
  });

  it('does not confuse invoice with a longer path segment', () => {
    expect(resolveAccountingArea('/accounting/scs/invoice-aging')).toBeUndefined();
  });
});

describe('segmentUrl', () => {
  it('fills in the books', () => {
    const bills = ACCOUNTING_AREAS.find(a => a.id === 'payables')!.segments[0];
    expect(segmentUrl(bills, 'gss')).toBe('/accounting/gss/bill/all/c-bill');
  });
  it('leaves a books-less url alone', () => {
    const expenses = ACCOUNTING_AREAS.find(a => a.id === 'payables')!.segments[2];
    expect(segmentUrl(expenses, 'gss')).toBe('/expense/all/c-expense');
  });
});

describe('ACCOUNTING_AREAS', () => {
  it('has eight areas with unique segment ids', () => {
    expect(ACCOUNTING_AREAS.map(a => a.id)).toEqual(['overview', 'journal', 'payables', 'receivables', 'cost', 'reports', 'closing', 'masterData']);
    const ids = ACCOUNTING_AREAS.flatMap(a => a.segments.map(s => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
