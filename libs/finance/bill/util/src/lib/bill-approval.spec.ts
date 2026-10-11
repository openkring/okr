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

  it('follows the configured order, not the order of the bills', () =>
    expect(groupApprovalBills([b('1', 'zkb'), b('2', ''), b('3', 'ubs'), b('4', 'zkb')], ['ubs', 'zkb'])
      .map(g => g.bills.map((x: { okey: string }) => x.okey))).toEqual([['3'], ['1', '4'], ['2']]));

  it('puts a key missing from the configured order behind the configured ones, before the no-account group', () =>
    expect(groupApprovalBills([b('1', 'old'), b('2', ''), b('3', 'zkb')], ['zkb']).map(g => g.heading))
      .toEqual(['Konto zkb', 'Konto old', '']));

  it('groups a removed paying account (key blanked by the callable) with the bills without one', () => {
    const removed = { ...(b('1', '') as object) } as never;
    expect(groupApprovalBills([removed, b('2', 'zkb'), b('3', '')], ['zkb']).map(g => g.bills.map((x: { okey: string }) => x.okey)))
      .toEqual([['2'], ['1', '3']]);
  });

  it('falls back to the key when name and IBAN are unknown', () =>
    expect(groupApprovalBills([{ ...(b('1', 'zkb') as object), paymentAccountName: '' } as never], ['zkb'])[0].heading).toBe('zkb'));

  it('returns no groups for no bills', () => expect(groupApprovalBills([])).toEqual([]));
});
