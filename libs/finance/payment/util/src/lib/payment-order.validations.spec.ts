import { describe, expect, it } from 'vitest';
import { PaymentOrderModel } from '@okr/shared-models';
import { paymentOrderValidations } from './payment-order.validations';

const order = (patch: Partial<PaymentOrderModel> = {}): PaymentOrderModel =>
  ({ ...new PaymentOrderModel('scs', 'scs'), ...patch } as PaymentOrderModel);

describe('paymentOrderValidations', () => {
  it('rejects an order without debit account', () => {
    expect(paymentOrderValidations(order({ executionDate: '20261015' })).hasErrors('debitAccountKey')).toBe(true);
  });

  it('rejects an order without execution date', () => {
    expect(paymentOrderValidations(order({ debitAccountKey: 'acc1' })).hasErrors('executionDate')).toBe(true);
  });

  it('rejects an invalid execution date', () => {
    expect(paymentOrderValidations(order({ debitAccountKey: 'acc1', executionDate: '20261399' })).hasErrors('executionDate')).toBe(true);
  });

  it('accepts an order with debit account and execution date', () => {
    expect(paymentOrderValidations(order({ debitAccountKey: 'acc1', executionDate: '20261015' })).isValid()).toBe(true);
  });
});
