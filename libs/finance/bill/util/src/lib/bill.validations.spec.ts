import { describe, expect, it } from 'vitest';

import { BillModel } from '@okr/shared-models';

import { billLineDetailsValidations } from './bill-line.validations';
import { billDetailsValidations } from './bill.validations';

const bill = (o: Partial<BillModel>) => ({ title: 'T', billId: 'R1', billDate: '20260901', dueDate: '20261001', state: 'todo', paymentReference: '', creditorIban: '', ...o }) as BillModel;

describe('billDetailsValidations', () => {
  it('accepts a legacy bill without billId and billDate', () => {
    expect(billDetailsValidations(bill({ billId: '', billDate: '' }), { dueDate: '20261001' }).isValid()).toBe(true);
  });

  it('accepts a paid bill whose due date equals the bill date', () => {
    const b = bill({ state: 'paid', dueDate: '20260901' });
    expect(billDetailsValidations(b, { dueDate: '20260901' }).isValid()).toBe(true);
  });

  it('accepts an untouched unpaid due date that is not after the bill date', () => {
    expect(billDetailsValidations(bill({ dueDate: '20260901' }), { dueDate: '20260901' }).isValid()).toBe(true);
  });

  it('refuses an unpaid bill whose changed due date is before the bill date', () => {
    expect(billDetailsValidations(bill({ dueDate: '20260801' }), { dueDate: '20261001' }).isValid()).toBe(false);
  });

  it('refuses a too long title', () => {
    expect(billDetailsValidations(bill({ title: 'x'.repeat(500) }), { dueDate: '20261001' }).isValid()).toBe(false);
  });
});

describe('billLineDetailsValidations', () => {
  it('ignores account and amount of migrated lines, checks the title length', () => {
    expect(billLineDetailsValidations([{ title: 'a', accountKey: '', amount: 0 } as never]).isValid()).toBe(true);
    expect(billLineDetailsValidations([{ title: 'x'.repeat(300), accountKey: 'a', amount: 1 } as never]).isValid()).toBe(false);
  });
});
