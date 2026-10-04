import { describe, expect, it } from 'vitest';

import { InvoicePositionModel } from '@okr/shared-models';

import {
  applyDiscounts, InvoicePositionInput, moveItem, newLayoutPosition, newRebatePosition, positionsTotal, subtotalAt,
  toPositionInputs,
} from './invoice-position.util';
import { invoicePositionsValidations } from './invoice-position.validations';

const fix = (amount: number, accountKey = 'k'): InvoicePositionInput => ({ type: 'fix', name: 'p', amount, accountKey });
const pct = (discountPercent: number, accountKey = ''): InvoicePositionInput =>
  ({ ...newRebatePosition(accountKey), discountMode: 'percent', discountPercent });
const chf = (value: number, accountKey = ''): InvoicePositionInput =>
  ({ ...newRebatePosition(accountKey), discountMode: 'amount', discountPercent: 0, amount: -value });

describe('positionsTotal with kinds', () => {
  it('skips text, subtotal and page-break lines and subtracts discounts', () => {
    expect(positionsTotal([fix(100), newLayoutPosition('text'), chf(30), newLayoutPosition('subtotal'), newLayoutPosition('pageBreak')])).toBe(70);
  });
});

describe('subtotalAt', () => {
  it('sums the money positions above the index', () => {
    const list = [fix(100), fix(50.5), newLayoutPosition('subtotal'), chf(10), newLayoutPosition('subtotal')];
    expect(subtotalAt(list, 2)).toBe(150.5);
    expect(subtotalAt(list, 4)).toBe(140.5);
    expect(subtotalAt(list, 0)).toBe(0);
  });
});

describe('applyDiscounts', () => {
  it('computes a percent discount from the running total above it, in Rappen', () => {
    const [, d] = applyDiscounts([fix(333.33), pct(10)]);
    expect(d.amount).toBe(-33.33);
  });

  it('chains two discounts: the second sees the first', () => {
    const [, , d1, d2] = applyDiscounts([fix(100), fix(100), pct(10), pct(10)]);
    expect(d1.amount).toBe(-20);
    expect(d2.amount).toBe(-18);
  });

  it('leaves a fixed-amount discount and other positions untouched', () => {
    const list = [fix(100), chf(15), newLayoutPosition('text')];
    expect(applyDiscounts(list)).toEqual(list);
  });

  it('only counts positions above the discount', () => {
    const [d] = applyDiscounts([pct(10), fix(100)]);
    expect(d.amount).toBe(0);
  });
});

describe('moveItem', () => {
  it('moves up and down and ignores moves past the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('toPositionInputs with kinds', () => {
  const stored = (o: Partial<InvoicePositionModel>): InvoicePositionModel => ({ ...new InvoicePositionModel('scs'), ...o });

  it('sorts by sortOrder and keeps the kind', () => {
    const list = toPositionInputs([
      stored({ name: 'b', sortOrder: 1, invoicePositionType: 'text' }),
      stored({ name: 'a', sortOrder: 0, amount: 10 }),
    ]);
    expect(list.map(p => [p.name, p.type])).toEqual([['a', 'fix'], ['b', 'text']]);
  });

  it('restores the mode of a discount from its percent', () => {
    const [p, a] = toPositionInputs([
      stored({ invoicePositionType: 'rebate', discountPercent: 5, amount: -5, sortOrder: 0 }),
      stored({ invoicePositionType: 'rebate', discountPercent: 0, amount: -20, sortOrder: 1 }),
    ]);
    expect(p).toMatchObject({ type: 'rebate', discountMode: 'percent', discountPercent: 5 });
    expect(a).toMatchObject({ type: 'rebate', discountMode: 'amount', discountPercent: 0 });
  });
});

describe('invoicePositionsValidations with kinds', () => {
  it('needs at least one money position', () => {
    expect(invoicePositionsValidations([newLayoutPosition('text')].map(p => ({ ...p, name: 'Hallo' }))).getErrors('positions').length).toBe(1);
  });

  it('accepts layout lines: text with a name, subtotal and page break as they are', () => {
    const list = [fix(100), { ...newLayoutPosition('text'), name: 'Hinweis' }, newLayoutPosition('subtotal'), newLayoutPosition('pageBreak')];
    expect(invoicePositionsValidations(list).isValid()).toBe(true);
  });

  it('needs a name on a text line', () => {
    expect(invoicePositionsValidations([fix(100), newLayoutPosition('text')]).getErrors('1.name').length).toBe(1);
  });

  it('accepts a discount without account (it reduces the revenue above it)', () => {
    expect(invoicePositionsValidations(applyDiscounts([fix(100), pct(10)])).isValid()).toBe(true);
  });

  it('refuses a discount of zero and a percent above 100', () => {
    expect(invoicePositionsValidations([fix(100), chf(0)]).getErrors('1.amount').length).toBe(1);
    expect(invoicePositionsValidations(applyDiscounts([fix(100), pct(120)])).getErrors('1.discountPercent').length).toBe(1);
  });
});
