import { describe, it, expect } from 'vitest';
import { AccountBalanceEntry, aggregateAccountBalances, exportToCsv } from './reporting.util';
import { BookingLineModel } from '@bk2/shared-models';

describe('aggregateAccountBalances', () => {
  const makeLines = (accountKey: string, debit: number, credit: number): Partial<BookingLineModel> => ({
    accountKey,
    debitAmount:  debit  > 0 ? { amount: debit,  currency: 'CHF', periodicity: 'one-time' } : undefined,
    creditAmount: credit > 0 ? { amount: credit, currency: 'CHF', periodicity: 'one-time' } : undefined,
  });

  it('sums debit and credit per account key', () => {
    const lines: Partial<BookingLineModel>[] = [
      makeLines('1000', 10000, 0),
      makeLines('1000',  5000, 0),
      makeLines('2000',     0, 15000),
    ];
    const result = aggregateAccountBalances(lines as BookingLineModel[]);
    const acc1000 = result.find(r => r.accountKey === '1000');
    const acc2000 = result.find(r => r.accountKey === '2000');
    expect(acc1000?.totalDebit).toBe(15000);
    expect(acc1000?.totalCredit).toBe(0);
    expect(acc2000?.totalCredit).toBe(15000);
  });

  it('computes net as debit minus credit', () => {
    const lines: Partial<BookingLineModel>[] = [
      makeLines('1000', 10000, 3000),
    ];
    const result = aggregateAccountBalances(lines as BookingLineModel[]);
    expect(result[0].net).toBe(7000);
  });

  it('returns empty array for no lines', () => {
    expect(aggregateAccountBalances([])).toEqual([]);
  });
});

describe('exportToCsv', () => {
  it('serialises rows with header', () => {
    const rows: AccountBalanceEntry[] = [
      { accountKey: '1000', totalDebit: 10000, totalCredit: 3000, net: 7000 },
    ];
    const csv = exportToCsv(rows);
    expect(csv).toContain('accountKey,totalDebit,totalCredit,net');
    expect(csv).toContain('1000,10000,3000,7000');
  });
});
