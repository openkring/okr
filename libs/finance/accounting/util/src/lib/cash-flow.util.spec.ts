import { describe, expect, it } from 'vitest';

import { AccountModel, BookingLineModel, BookingModel, MoneyModel } from '@okr/shared-models';

import { cashFlowDirect } from './cash-flow.util';

const account = (okey: string, id: string, name = id) => Object.assign(new AccountModel('scs'), { okey, id, name });
const booking = (okey: string, date: string, status = 'posted') =>
  Object.assign(new BookingModel('scs', 'scs'), { okey, date, status });
const line = (bookingKey: string, accountKey: string, debit: number, credit: number) =>
  Object.assign(new BookingLineModel('scs', 'scs'), { bookingKey, accountKey,
    debitAmount: debit ? new MoneyModel(debit, 'CHF') : undefined, creditAmount: credit ? new MoneyModel(credit, 'CHF') : undefined });

const accounts = [
  account('bank', '1020', 'Bank'), account('cash', '1000', 'Kasse'), account('deb', '1100', 'Debitoren'),
  account('kred', '2000', 'Kreditoren'), account('fees', '3000', 'Mitgliederbeiträge'), account('mat', '4000', 'Material'),
  account('bankfee', '6940', 'Bankspesen'), account('sec', '1060', 'Wertschriften'),
];

describe('cashFlowDirect', () => {
  const bookings = [
    booking('b1', '20260110'), booking('b2', '20260120'), booking('b3', '20260201'),
    booking('b4', '20260210'), booking('b5', '20260215', 'forReview'), booking('b6', '20251231'),
    booking('b7', '20260301'),
  ];
  const lines = [
    line('b1', 'bank', 10000, 0), line('b1', 'fees', 0, 10000),                              // fees received
    line('b2', 'kred', 5000, 0), line('b2', 'bankfee', 10, 0), line('b2', 'bank', 0, 5010),  // bill paid with a fee
    line('b3', 'cash', 2000, 0), line('b3', 'bank', 0, 2000),                                // bank → cash: internal
    line('b4', 'deb', 3000, 0), line('b4', 'fees', 0, 3000),                                 // no cash: not a flow
    line('b5', 'bank', 999, 0), line('b5', 'fees', 0, 999),                                  // not posted
    line('b6', 'bank', 7777, 0), line('b6', 'fees', 0, 7777),                                // before the year
    line('b7', 'mat', 1500, 0), line('b7', 'cash', 0, 1500),                                 // material paid cash
  ];
  const result = cashFlowDirect(bookings, lines, accounts, '20260101', '20261231', 50000);

  it('attributes each cash movement to the accounts on the other side', () => {
    expect(result.inflows).toEqual([{ accountKey: 'fees', accountId: '3000', accountName: 'Mitgliederbeiträge', amount: 10000 }]);
    expect(result.outflows.map(r => [r.accountId, r.amount])).toEqual([['2000', 5000], ['4000', 1500], ['6940', 10]]);
  });

  it('sums, nets and reaches the closing balance from the opening balance', () => {
    expect(result.totalIn).toBe(10000);
    expect(result.totalOut).toBe(6510);
    expect(result.net).toBe(3490);
    expect(result.opening).toBe(50000);
    expect(result.closing).toBe(53490);
  });

  it('leaves transfers between cash accounts out, but reports their volume', () => {
    expect(result.internalTransfers).toBe(2000);
  });

  it('has no closing balance while the opening balance is unknown', () => {
    const r = cashFlowDirect(bookings, lines, accounts, '20260101', '20261231', undefined);
    expect(r.opening).toBeUndefined();
    expect(r.closing).toBeUndefined();
    expect(r.net).toBe(3490);
  });
});
