import { describe, it, expect, vi } from 'vitest';

// Stub the IBAN sub-suite: it transitively pulls in @okr/shared-util-angular (Angular + Ionic),
// which a pure util test must not load. checkIban itself is covered by iban.util.spec.ts.
// The 'ibanRequired' (isNotBlank) rule lives in expense.validations directly, so empty-vs-set
// IBAN behaviour is still exercised below.
vi.mock('@okr/subject-address-util', () => ({ ibanValidations: () => undefined }));

import { expenseEditValidations, ExpenseEditFormValue, expenseValidations, ExpenseFormValue } from './expense.validations';

// A fully valid reimbursement (transfer to the employee, valid electronic IBAN).
const validExpense = (): ExpenseFormValue => ({
  abstract: 'Büromaterial',
  amountCHF: 100,
  currency: 'CHF',
  transferTo: 'me',
  iban: 'CH9800700112900069345',
  category: '',
  costCenterId: '',
  note: '',
});

describe('expenseValidations', () => {
  it('a fully valid expense passes (regression: currency rule must use inside(), not isIn())', () => {
    const res = expenseValidations(validExpense());
    // isIn is not an n4s rule; it threw and made currency always invalid → the whole
    // suite never became valid → the change-confirmation banner never appeared.
    expect(res.getErrors('currency')).toEqual([]);
    expect(res.isValid()).toBe(true);
  });

  it('accepts every allowed currency', () => {
    for (const currency of ['CHF', 'EUR', 'USD', 'GBP']) {
      const res = expenseValidations({ ...validExpense(), currency });
      expect(res.getErrors('currency')).toEqual([]);
    }
  });

  it('rejects an unknown currency', () => {
    const res = expenseValidations({ ...validExpense(), currency: 'XYZ' });
    expect(res.isValid()).toBe(false);
    expect(res.getErrors('currency').length).toBeGreaterThan(0);
  });

  it('requires an abstract of at least 3 characters', () => {
    const res = expenseValidations({ ...validExpense(), abstract: 'ab' });
    expect(res.isValid()).toBe(false);
    expect(res.getErrors('abstract').length).toBeGreaterThan(0);
  });

  it('requires a positive amount', () => {
    const res = expenseValidations({ ...validExpense(), amountCHF: 0 });
    expect(res.isValid()).toBe(false);
    expect(res.getErrors('amountCHF').length).toBeGreaterThan(0);
  });

  it('requires a valid IBAN when transferring to the employee', () => {
    const res = expenseValidations({ ...validExpense(), iban: '' });
    expect(res.isValid()).toBe(false);
    expect(res.getErrors('iban').length).toBeGreaterThan(0);
  });

  it('does not require an IBAN when transferring to the issuer', () => {
    const res = expenseValidations({ ...validExpense(), transferTo: 'issuer', iban: '' });
    expect(res.getErrors('iban')).toEqual([]);
    expect(res.isValid()).toBe(true);
  });
});

describe('expenseEditValidations', () => {
  const valid: ExpenseEditFormValue = {
    abstract: 'Materialkauf', amountTotal: 12500, currency: 'CHF', transferTo: 'me',
    category: '', costCenterId: '', note: '', status: 'validated',
  };

  it('accepts a complete edit value', () => {
    expect(expenseEditValidations(valid).isValid()).toBe(true);
  });

  it('rejects an empty abstract', () => {
    const result = expenseEditValidations({ ...valid, abstract: '' });
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('abstract').length).toBeGreaterThan(0);
  });

  it('rejects an abstract shorter than 3 characters', () => {
    expect(expenseEditValidations({ ...valid, abstract: 'ab' }).isValid()).toBe(false);
  });

  it('rejects a zero or negative amount (cents)', () => {
    expect(expenseEditValidations({ ...valid, amountTotal: 0 }).isValid()).toBe(false);
    expect(expenseEditValidations({ ...valid, amountTotal: -1 }).isValid()).toBe(false);
  });

  it('rejects an unknown currency', () => {
    expect(expenseEditValidations({ ...valid, currency: 'XYZ' }).isValid()).toBe(false);
  });

  it('does NOT require an IBAN even when the transfer goes to the employee', () => {
    // the edit form owns no IBAN field — the create suite's iban test must not leak in
    expect(expenseEditValidations({ ...valid, transferTo: 'me' }).isValid()).toBe(true);
  });
});
