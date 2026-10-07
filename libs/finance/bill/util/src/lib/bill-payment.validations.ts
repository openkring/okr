import { enforce, omitWhen, staticSuite, test } from 'vest';

import { dateValidations } from '@okr/shared-util-core';

import { BillPaymentFormModel } from './bill-payment.util';

const VPFX = '@finance/bill/feature.payment.validation.';

/** Rappen of a CHF amount — the same rounding the service applies before the callable. */
const toRappen = (chf: number): number => Math.round(chf * 100);

/**
 * The bill payment dialog (spec 1.85): a date, an amount above 0 and at most the open amount, and —
 * by mode — the account the money left from or the booking to link (whose payables debit must cover
 * the amount). The server checks all of it again; this only keeps the dialog honest.
 */
export const billPaymentValidations = staticSuite((model: BillPaymentFormModel) => {
  test('date', VPFX + 'dateRequired', () => {
    enforce(model.date ?? '').isNotBlank();
  });
  dateValidations('date', model.date);

  test('amount', VPFX + 'amountPositive', () => {
    enforce(Number.isFinite(model.amount) && toRappen(model.amount) > 0).isTruthy();
  });
  test('amount', VPFX + 'amountTooHigh', () => {
    enforce(toRappen(model.amount) <= toRappen(model.openAmount)).isTruthy();
  });

  omitWhen(model.mode !== 'post', () => {
    test('bankAccountKey', VPFX + 'bankAccountRequired', () => {
      enforce(model.bankAccountKey ?? '').isNotBlank();
    });
  });

  omitWhen(model.mode !== 'link', () => {
    test('bookingKey', VPFX + 'bookingRequired', () => {
      enforce(model.bookingKey ?? '').isNotBlank();
    });
    omitWhen(!model.bookingKey, () => {
      test('amount', VPFX + 'amountAboveBooking', () => {
        enforce(toRappen(model.amount) <= toRappen(model.bookingAmount)).isTruthy();
      });
    });
  });
});
