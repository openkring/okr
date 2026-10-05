import { describe, expect, it } from 'vitest';

import { AccountModel, BookingLineModel, BookingModel } from '@okr/shared-models';

import { ledgerAccounts, ledgerBookings, storeDateYear } from './ledger.util';

function account(okey: string, id: string, name: string): AccountModel {
  return Object.assign(new AccountModel('scs'), { okey, id, name });
}

function booking(okey: string, patch: Partial<BookingModel> = {}): BookingModel {
  return Object.assign(new BookingModel('scs'), { okey, date: '20260115', bookingNo: 7, title: 'Rechnung 1', status: 'posted' }, patch);
}

function line(bookingKey: string, accountKey: string, debit: number, credit: number): BookingLineModel {
  const l = new BookingLineModel('scs', 'scs');
  l.bookingKey = bookingKey;
  l.accountKey = accountKey;
  if (debit) l.debitAmount = { amount: debit, currency: 'CHF', periodicity: 'one-time' };
  if (credit) l.creditAmount = { amount: credit, currency: 'CHF', periodicity: 'one-time' };
  return l;
}

const accounts = [account('scs-1100', '1100', 'Debitoren'), account('scs-3400', '3400', 'Mitgliederbeiträge'), account('scs-1020', '1020', 'Bank')];

describe('ledgerAccounts', () => {
  it('resolves number and name in the given order', () => {
    expect(ledgerAccounts(['scs-3400', 'scs-1100'], accounts)).toEqual([
      { accountKey: 'scs-3400', accountId: '3400', accountName: 'Mitgliederbeiträge' },
      { accountKey: 'scs-1100', accountId: '1100', accountName: 'Debitoren' },
    ]);
  });

  it('shows the key of an unknown account', () => {
    expect(ledgerAccounts(['scs-9999'], accounts)).toEqual([{ accountKey: 'scs-9999', accountId: 'scs-9999', accountName: '' }]);
  });
});

describe('ledgerBookings', () => {
  it('lists the bookings in key order as journal rows: Soll and Haben accounts and the total', () => {
    const bookings = [booking('inv-pay', { bookingNo: 9, date: '20260201' }), booking('inv')];
    const lines = [
      line('inv', 'scs-3400', 0, 12000), line('inv', 'scs-1100', 12000, 0),
      line('inv-pay', 'scs-1100', 0, 12000), line('inv-pay', 'scs-1020', 12000, 0),
      line('other', 'scs-1020', 500, 0),
    ];
    const result = ledgerBookings(['inv', 'inv-pay'], bookings, lines, accounts);
    expect(result.map(b => b.bookingKey)).toEqual(['inv', 'inv-pay']);
    expect(result[0]).toMatchObject({ date: '20260115', bookingNo: 7, title: 'Rechnung 1', status: 'posted', amount: 12000 });
    expect(result[0].debit).toEqual([{ accountKey: 'scs-1100', accountId: '1100', accountName: 'Debitoren' }]);
    expect(result[0].credit).toEqual([{ accountKey: 'scs-3400', accountId: '3400', accountName: 'Mitgliederbeiträge' }]);
    expect(result[1].debit.map(a => a.accountId)).toEqual(['1020']);
    expect(result[1].credit.map(a => a.accountId)).toEqual(['1100']);
  });

  it('lists each account of a split booking once per side, by account number', () => {
    const lines = [
      line('inv', 'scs-3400', 0, 8000), line('inv', 'scs-1100', 12000, 0), line('inv', 'scs-3400', 0, 1000),
      line('inv', 'scs-1020', 0, 3000),
    ];
    const result = ledgerBookings(['inv'], [booking('inv')], lines, accounts);
    expect(result[0].credit.map(a => a.accountId)).toEqual(['1020', '3400']);
    expect(result[0].amount).toBe(12000);
  });

  it('skips keys without a loaded booking and duplicate keys', () => {
    const result = ledgerBookings(['inv', 'inv-storno', 'inv'], [booking('inv')], [], accounts);
    expect(result.map(b => b.bookingKey)).toEqual(['inv']);
    expect(result[0]).toMatchObject({ debit: [], credit: [], amount: 0 });
  });
});

describe('storeDateYear', () => {
  it('takes the year of a StoreDate', () => {
    expect(storeDateYear('20260115')).toBe(2026);
  });

  it('is undefined for an empty date', () => {
    expect(storeDateYear('')).toBeUndefined();
    expect(storeDateYear(undefined)).toBeUndefined();
  });
});
