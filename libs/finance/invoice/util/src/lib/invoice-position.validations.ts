import { enforce, only, staticSuite, test } from 'vest';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';

import { InvoicePositionInput, MAX_INVOICE_POSITIONS } from './invoice-position.util';

const PFX = '@finance/invoice/feature.positions.error.';

/** The longest position name the form lets you type (the server cuts at 200). */
export const INVOICE_POSITION_NAME_LENGTH = LONG_NAME_LENGTH;

/**
 * The positions of a draft invoice: at least one, at most MAX_INVOICE_POSITIONS, each with a name, an
 * amount above zero and a revenue account. Per-row failures are filed as `<index>.<field>` so the form
 * shows each note under its own row.
 */
export const invoicePositionsValidations = staticSuite((positions: InvoicePositionInput[], field?: string) => {
  if (field) only(field);
  const list = positions ?? [];

  test('positions', PFX + 'empty', () => {
    enforce(list.length).greaterThan(0);
  });
  test('positions', PFX + 'tooMany', () => {
    enforce(list.length).lessThanOrEquals(MAX_INVOICE_POSITIONS);
  });

  list.forEach((p, i) => {
    test(`${i}.name`, PFX + 'name', () => {
      enforce((p.name ?? '').trim()).isNotEmpty();
    });
    test(`${i}.name`, PFX + 'nameLength', () => {
      enforce((p.name ?? '').length).lessThanOrEquals(INVOICE_POSITION_NAME_LENGTH);
    });
    test(`${i}.amount`, PFX + 'amount', () => {
      enforce(Number.isFinite(p.amount) && Math.round(p.amount * 100) > 0).isTruthy();
    });
    test(`${i}.accountKey`, PFX + 'account', () => {
      enforce((p.accountKey ?? '').trim()).isNotEmpty();
    });
  });
});
