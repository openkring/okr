import { describe, expect, it } from 'vitest';

import { BillModel } from '@okr/shared-models';

import { billLinesTotal, isDraftBill, newBillLine, toBillLines } from './bill-line.util';
import { billLinesValidations } from './bill-line.validations';

describe('bill lines', () => {
  it('a new line, the total and the editable copy of a legacy doc', () => {
    expect(newBillLine('scs0238', 3900, 'DSL')).toEqual({ title: 'DSL', accountKey: 'scs0238', amount: 3900, vatCodeKey: '', costCenterKey: '' });
    expect(billLinesTotal([newBillLine('a', 100), newBillLine('b', 250)])).toBe(350);
    expect(toBillLines({} as BillModel)).toEqual([]);
    expect(toBillLines({ lines: [{ accountKey: 'a', amount: 1 }] } as never)).toEqual([newBillLine('a', 1)]);
  });

  it('only a draft without a booking is editable', () => {
    expect(isDraftBill({ state: 'draft', bookingKeys: [] })).toBe(true);
    expect(isDraftBill({ state: 'draft' } as never)).toBe(true);
    expect(isDraftBill({ state: 'draft', bookingKeys: ['bill-k'] })).toBe(false);
    expect(isDraftBill({ state: 'todo', bookingKeys: [] })).toBe(false);
  });

  it('validates per row and the list', () => {
    expect(billLinesValidations([newBillLine('a', 100)]).isValid()).toBe(true);
    expect(billLinesValidations([]).getErrors('lines').length).toBe(1);
    const r = billLinesValidations([newBillLine('', 0)]);
    expect(r.getErrors('lines[0].accountKey').length).toBe(1);
    expect(r.getErrors('lines[0].amount').length).toBe(1);
    expect(billLinesValidations([newBillLine('a', 10.5)]).getErrors('lines[0].amount').length).toBe(1);
  });
});
