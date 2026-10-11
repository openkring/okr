import { describe, expect, it } from 'vitest';

import { groupApprovalBills } from './bill-approval';

const b = (okey: string, paymentAccountKey: string) => ({ okey, paymentAccountKey, paymentAccountName: paymentAccountKey ? `Konto ${paymentAccountKey}` : '', paymentAccountIban: '' }) as never;

describe('groupApprovalBills', () => {
  it('groups by paying account, without one last', () =>
    expect(groupApprovalBills([b('1', ''), b('2', 'zkb'), b('3', 'zkb')]).map(g => g.bills.map((x: { okey: string }) => x.okey))).toEqual([['2', '3'], ['1']]));

  it('keeps first-seen order and builds the heading from name and IBAN', () => {
    const bills = [
      { ...(b('1', 'ubs') as object), paymentAccountIban: 'CH93 0076 2011 6238 5295 7' },
      b('2', 'zkb'),
      b('3', ''),
    ] as never[];
    expect(groupApprovalBills(bills).map(g => g.heading)).toEqual(['Konto ubs · CH93 0076 2011 6238 5295 7', 'Konto zkb', '']);
  });

  it('returns no groups for no bills', () => expect(groupApprovalBills([])).toEqual([]));
});
