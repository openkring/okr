import { enforce, staticSuite, test } from 'vest';

import { BillLine } from '@okr/shared-models';

import { BILL_LINE_TITLE_LENGTH, MAX_BILL_LINES } from './bill-line.util';

const VPFX = '@finance/bill/feature.line.validation.';

/**
 * The lines of a native bill (spec 1.85 Q2): at least one, at most MAX_BILL_LINES, each with an account
 * and an amount above 0, and a title within the server's cap. Errors are filed per row as
 * `lines[i].accountKey` / `lines[i].amount` / `lines[i].title`, and `lines` for the list itself.
 */
export const billLinesValidations = staticSuite((lines: BillLine[]) => {
  test('lines', VPFX + 'linesRequired', () => {
    enforce((lines ?? []).length).greaterThan(0);
  });
  test('lines', VPFX + 'tooManyLines', () => {
    enforce((lines ?? []).length).lessThanOrEquals(MAX_BILL_LINES);
  });
  (lines ?? []).forEach((line, i) => {
    test(`lines[${i}].accountKey`, VPFX + 'accountRequired', () => {
      enforce(line.accountKey ?? '').isNotBlank();
    });
    test(`lines[${i}].amount`, VPFX + 'amountPositive', () => {
      enforce(Number.isInteger(line.amount) && line.amount > 0).isTruthy();
    });
    test(`lines[${i}].title`, VPFX + 'titleTooLong', () => {
      enforce((line.title ?? '').length).lessThanOrEquals(BILL_LINE_TITLE_LENGTH);
    });
  });
});

/** The lines of a booked or paid bill (spec 1.92): only the editable line title is checked; account and amount stay as booked. */
export const billLineDetailsValidations = staticSuite((lines: BillLine[]) => {
  (lines ?? []).forEach((line, i) => {
    test(`lines[${i}].title`, VPFX + 'titleTooLong', () => {
      enforce((line.title ?? '').length).lessThanOrEquals(BILL_LINE_TITLE_LENGTH);
    });
  });
});
