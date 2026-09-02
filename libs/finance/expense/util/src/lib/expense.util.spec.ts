import { describe, it, expect } from 'vitest';
import { normalizeIban, chfToCents, centsToCHF, newExpenseModel, newExpenseDocumentModel, canDeleteExpense, canRedoOcr, canOpenTask, canOpenBooking, canViewExpense, canEditExpense, filterExpenses, sortExpenses, getExpenseStateCategory, getExpenseTransferCategory } from './expense.util';
import { ExpenseModel, UserModel } from '@okr/shared-models';

describe('normalizeIban', () => {
  it('strips whitespace and uppercases', () => {
    expect(normalizeIban('ch67 0070 0110 4044 7417 6')).toBe('CH6700700110404474176');
  });
  it('already normalized iban stays the same', () => {
    expect(normalizeIban('CH6700700110404474176')).toBe('CH6700700110404474176');
  });
});

describe('chfToCents', () => {
  it('converts 25.50 CHF to 2550 cents', () => {
    expect(chfToCents(25.50)).toBe(2550);
  });
  it('rounds half-penny correctly', () => {
    expect(chfToCents(1.005)).toBe(100);
  });
  it('converts 0 to 0', () => {
    expect(chfToCents(0)).toBe(0);
  });
});

describe('centsToCHF', () => {
  it('converts 2550 cents to 25.50', () => {
    expect(centsToCHF(2550)).toBe(25.50);
  });
  it('converts 0 to 0', () => {
    expect(centsToCHF(0)).toBe(0);
  });
});

describe('newExpenseModel', () => {
  it('creates model with correct tenants and userId', () => {
    const m = newExpenseModel('tenant1', 'user1', 'acctTenant1');
    expect(m.tenants).toContain('tenant1');
    expect(m.userId).toBe('user1');
    expect(m.accountingTenantId).toBe('acctTenant1');
    expect(m.status).toBe('draft');
  });
});

describe('newExpenseDocumentModel', () => {
  it('creates model with expenseKey and documentKey', () => {
    const m = newExpenseDocumentModel('tenant1', 'expense1', 'doc1');
    expect(m.expenseKey).toBe('expense1');
    expect(m.documentKey).toBe('doc1');
    expect(m.ocrStatus).toBe('pending');
    expect(m.tenants).toContain('tenant1');
  });
});

function author(): UserModel { const u = new UserModel('t'); u.okey = 'u1'; return u; }
function treasurer(): UserModel { const u = new UserModel('t'); u.okey = 'u2'; u.roles = { treasurer: true }; return u; }
function stranger(): UserModel { const u = new UserModel('t'); u.okey = 'u9'; return u; }
function expense(over: Partial<ExpenseModel> = {}): ExpenseModel { return Object.assign(new ExpenseModel('t'), { userId: 'u1' }, over); }

describe('expense permission predicates', () => {
  it('view/delete: author or treasurer, not a stranger', () => {
    expect(canViewExpense(expense(), author())).toBe(true);
    expect(canViewExpense(expense(), treasurer())).toBe(true);
    expect(canViewExpense(expense(), stranger())).toBe(false);
    expect(canDeleteExpense(expense(), author())).toBe(true);
    expect(canDeleteExpense(expense(), treasurer())).toBe(true);
    expect(canDeleteExpense(expense(), stranger())).toBe(false);
  });
  it('redo OCR: treasurer only, and only when not yet booked', () => {
    expect(canRedoOcr(expense(), treasurer())).toBe(true);
    expect(canRedoOcr(expense({ bookingKey: 'b1' }), treasurer())).toBe(false);
    expect(canRedoOcr(expense(), author())).toBe(false);
  });
  it('open task: author/treasurer AND taskKey present', () => {
    expect(canOpenTask(expense({ taskKey: 'k1' }), author())).toBe(true);
    expect(canOpenTask(expense(), author())).toBe(false);
    expect(canOpenTask(expense({ taskKey: 'k1' }), stranger())).toBe(false);
  });
  it('open booking: author/treasurer AND bookingKey present', () => {
    expect(canOpenBooking(expense({ bookingKey: 'b1' }), author())).toBe(true);
    expect(canOpenBooking(expense(), author())).toBe(false);
    expect(canOpenBooking(expense({ bookingKey: 'b1' }), stranger())).toBe(false);
  });
  it('undefined user → all false', () => {
    expect(canViewExpense(expense(), undefined)).toBe(false);
    expect(canRedoOcr(expense(), undefined)).toBe(false);
  });
  it('edit: treasurer or admin only — never the plain author', () => {
    expect(canEditExpense(expense(), treasurer())).toBe(true);
    expect(canEditExpense(expense(), author())).toBe(false);
    expect(canEditExpense(expense(), stranger())).toBe(false);
    expect(canEditExpense(expense(), undefined)).toBe(false);
  });
});

// --- list filtering / sorting -------------------------------------------------

function listItem(over: Partial<ExpenseModel>): ExpenseModel {
  return Object.assign(new ExpenseModel('scs'), over);
}

const anna  = listItem({ okey: 'a', abstract: 'Taxi Bern',   userName: 'Anna Muster', amountTotal: 3000, status: 'posted',    transferTo: 'me',     creationDateTime: '20260101120000' });
const bruno = listItem({ okey: 'b', abstract: 'Hotel Zürich', userName: 'Bruno Kaiser', amountTotal: 12000, status: 'draft',  transferTo: 'issuer', creationDateTime: '20260315080000' });
const cesar = listItem({ okey: 'c', abstract: 'Znüni',        userName: 'Cesar Rossi',  amountTotal: 500,  status: 'draft',    transferTo: 'me',     creationDateTime: '20260210093000' });
const all = [anna, bruno, cesar];

describe('filterExpenses', () => {
  it("'all' on both dropdowns and an empty term keeps everything", () => {
    expect(filterExpenses(all, { searchTerm: '', status: 'all', transferTo: 'all' })).toHaveLength(3);
  });
  it('filters by status', () => {
    const result = filterExpenses(all, { searchTerm: '', status: 'draft', transferTo: 'all' });
    expect(result.map(e => e.okey)).toEqual(['b', 'c']);
  });
  it('filters by transferTo', () => {
    const result = filterExpenses(all, { searchTerm: '', status: 'all', transferTo: 'issuer' });
    expect(result.map(e => e.okey)).toEqual(['b']);
  });
  it('search matches the subject and the submitter name, case-insensitively', () => {
    expect(filterExpenses(all, { searchTerm: 'taxi', status: 'all', transferTo: 'all' }).map(e => e.okey)).toEqual(['a']);
    expect(filterExpenses(all, { searchTerm: 'kaiser', status: 'all', transferTo: 'all' }).map(e => e.okey)).toEqual(['b']);
  });
  it('combines all three criteria', () => {
    expect(filterExpenses(all, { searchTerm: 'z', status: 'draft', transferTo: 'me' }).map(e => e.okey)).toEqual(['c']);
  });
});

describe('sortExpenses', () => {
  it('sorts by date, newest first by default', () => {
    expect(sortExpenses(all, 'date', false).map(e => e.okey)).toEqual(['b', 'c', 'a']);
    expect(sortExpenses(all, 'date', true).map(e => e.okey)).toEqual(['a', 'c', 'b']);
  });
  it('sorts by amount', () => {
    expect(sortExpenses(all, 'amount', false).map(e => e.okey)).toEqual(['b', 'a', 'c']);
    expect(sortExpenses(all, 'amount', true).map(e => e.okey)).toEqual(['c', 'a', 'b']);
  });
  it('sorts by submitter name', () => {
    expect(sortExpenses(all, 'name', true).map(e => e.okey)).toEqual(['a', 'b', 'c']);
    expect(sortExpenses(all, 'name', false).map(e => e.okey)).toEqual(['c', 'b', 'a']);
  });
  it('does not mutate the input', () => {
    const input = [...all];
    sortExpenses(input, 'amount', true);
    expect(input.map(e => e.okey)).toEqual(['a', 'b', 'c']);
  });
});

describe('expense filter categories', () => {
  it('state category translates its items from the feature scope', () => {
    const category = getExpenseStateCategory('scs');
    expect(category.name).toBe('expense_state');
    expect(category.i18n).toBe('@finance/expense/feature');
    expect(category.translateItems).toBe(true);
    expect(category.items.map(i => i.name)).toEqual(['draft', 'processing', 'validated', 'error', 'posted', 'pending-export']);
  });
  it('transfer category carries the two transferTo values', () => {
    expect(getExpenseTransferCategory('scs').items.map(i => i.name)).toEqual(['me', 'issuer']);
  });
});
