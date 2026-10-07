import { enforce, staticSuite, test } from 'vest';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';

import { isMoneyPosition, isRebatePosition } from '@okr/shared-util-core';

import { InvoicePositionInput, MAX_INVOICE_POSITIONS } from './invoice-position.util';

const PFX = '@finance/invoice/feature.positions.error.';

/** The longest position name the form lets you type (the server cuts at 200). */
export const INVOICE_POSITION_NAME_LENGTH = LONG_NAME_LENGTH;

/**
 * The positions of a draft invoice: at least one money position, at most MAX_INVOICE_POSITIONS lines.
 * Per kind (spec 1.84): a money position needs a name, an amount above zero and an account; a discount
 * a name and a value (percent in (0, 100] or an amount), its account is optional; a text line a name;
 * subtotal and page break nothing. Per-row failures are filed as `<index>.<field>` so the form shows
 * each note under its own row.
 */
export const invoicePositionsValidations = staticSuite((positions: InvoicePositionInput[]) => {
  const list = positions ?? [];

  test('positions', PFX + 'empty', () => {
    enforce(list.filter((p) => isMoneyPosition(p)).length).greaterThan(0);
  });
  test('positions', PFX + 'tooMany', () => {
    enforce(list.length).lessThanOrEquals(MAX_INVOICE_POSITIONS);
  });

  list.forEach((p, i) => {
    test(`${i}.name`, PFX + 'nameLength', () => {
      enforce((p.name ?? '').length).lessThanOrEquals(INVOICE_POSITION_NAME_LENGTH);
    });
    if (p.type === 'subtotal' || p.type === 'pageBreak') return;
    test(`${i}.name`, p.type === 'text' ? PFX + 'text' : PFX + 'name', () => {
      enforce((p.name ?? '').trim()).isNotEmpty();
    });
    if (p.type === 'text') return;

    if (isRebatePosition(p)) {
      if (p.discountMode !== 'amount') {
        test(`${i}.discountPercent`, PFX + 'discountPercent', () => {
          const percent = Number(p.discountPercent);
          enforce(Number.isFinite(percent) && percent > 0 && percent <= 100).isTruthy();
        });
      }
      test(`${i}.amount`, PFX + 'discount', () => {
        enforce(Number.isFinite(p.amount) && Math.round(p.amount * 100) < 0).isTruthy();
      });
      return;
    }
    test(`${i}.amount`, PFX + 'amount', () => {
      enforce(Number.isFinite(p.amount) && Math.round(p.amount * 100) > 0).isTruthy();
    });
    test(`${i}.accountKey`, PFX + 'account', () => {
      enforce((p.accountKey ?? '').trim()).isNotEmpty();
    });
  });
});
