import { describe, it, expect } from 'vitest';
import { normalizeIban, chfToCents, centsToCHF, newExpenseModel, newExpenseDocumentModel, canDeleteExpense, canRedoOcr, canOpenTask, canOpenBooking, canViewExpense } from './expense.util';
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
});
