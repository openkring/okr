import { describe, it, expect, vi } from 'vitest';

// Stub the IBAN sub-suite: it transitively pulls in @okr/shared-util-angular (Angular + Ionic),
// which a pure util test must not load. checkIban itself is covered by iban.util.spec.ts.
// The 'ibanRequired' (isNotBlank) rule lives in expense.validations directly, so empty-vs-set
// IBAN behaviour is still exercised below.
vi.mock('@okr/subject-address-util', () => ({ ibanValidations: () => undefined }));

import { expenseValidations, ExpenseFormValue } from './expense.validations';

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
