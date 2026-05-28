import { describe, it, expect } from 'vitest';
import { normalizeIban, chfToCents, centsToCHF, newExpenseModel, newExpenseDocumentModel } from './expense.util';

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
  });
});
