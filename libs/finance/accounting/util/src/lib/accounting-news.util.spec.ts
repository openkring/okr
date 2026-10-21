import { describe, expect, it } from 'vitest';

import { BillModel, BookingModel, ExpenseModel, InvoiceModel } from '@okr/shared-models';

import { FIRST_VISIT_LOOKBACK_MS, nextVisit, storeDateTimeOf, summarizeNews, VISIT_WINDOW_MS } from './accounting-news.util';

const NOW = Date.UTC(2026, 9, 21, 10, 0, 0);

describe('nextVisit', () => {
  it('looks back a week on the first visit', () => {
    expect(nextVisit(undefined, NOW)).toEqual({ since: NOW - FIRST_VISIT_LOOKBACK_MS, seenAt: NOW, isFirst: true });
  });
  it('treats unreadable marks as a first visit', () => {
    expect(nextVisit({ since: NaN, seenAt: NOW }, NOW).isFirst).toBe(true);
  });
  it('moves the baseline to the previous visit', () => {
    const seenAt = NOW - 2 * VISIT_WINDOW_MS;
    expect(nextVisit({ since: 1, seenAt }, NOW)).toEqual({ since: seenAt, seenAt: NOW, isFirst: false });
  });
  it('keeps the baseline when coming back within the window', () => {
    expect(nextVisit({ since: 1, seenAt: NOW - 60_000 }, NOW)).toEqual({ since: 1, seenAt: NOW, isFirst: false });
  });
});

describe('storeDateTimeOf', () => {
  it('formats local time as yyyyMMddHHmmss', () => {
    const ms = new Date(2026, 0, 2, 3, 4, 5).getTime();
    expect(storeDateTimeOf(ms)).toBe('20260102030405');
  });
});

const booking = (okey: string, createdAt: string, bookingNo = 0) => Object.assign(new BookingModel('scs', 'scs'), { okey, createdAt, bookingNo, title: `B ${okey}` });
const party = (name2: string) => ({ key: 'k', name1: '', name2, modelType: 'org' as const, type: '', subType: '', label: '' });

describe('summarizeNews', () => {
  const since = '20261020000000';
  const bills = [
    Object.assign(new BillModel('scs'), { okey: 'b1', createdAt: '20261020100000', title: 'Strom', vendor: party('EKZ'), totalAmount: { amount: 12000, currency: 'CHF', periodicity: 'one-time' } }),
    Object.assign(new BillModel('scs'), { okey: 'b2', createdAt: '', title: 'Alt', billId: 'R-7', vendor: party('Migros'),
      payments: [{ date: '20261020', amount: 5000, type: 'post', bookingKey: 'bill-b2-pay-1' }, { date: '20260101', amount: 100, type: 'post', bookingKey: 'old' }] }),
  ];
  const invoices = [
    Object.assign(new InvoiceModel('scs'), { okey: 'i1', createdAt: '20261021090000', title: 'Beitrag', receiver: party('Muster AG'), totalAmount: { amount: 30000, currency: 'CHF', periodicity: 'one-time' },
      payments: [{ date: '20261021', amount: 30000, bankAccountKey: 'a', bookingKey: 'invoice-i1-pay-1' }] }),
    Object.assign(new InvoiceModel('scs'), { okey: 'i2', createdAt: '20261001000000', title: 'Alt' }),
  ];
  const expenses = [
    Object.assign(new ExpenseModel('scs'), { okey: 'e1', creationDateTime: '20261020120000', status: 'processing', userName: 'Anna', abstract: 'Taxi', amountTotal: 4550 }),
    Object.assign(new ExpenseModel('scs'), { okey: 'e2', creationDateTime: '20261020130000', status: 'draft' }),
    Object.assign(new ExpenseModel('scs'), { okey: 'e3', creationDateTime: '20261019000000', status: 'done' }),
  ];
  const bookings = [booking('bill-b2-pay-1', '20261020110000', 12), booking('invoice-i1-pay-1', '20261021093000', 13), booking('x', '20261019000000')];

  const news = summarizeNews({ since, bookings, bills, invoices, expenses });

  it('lists new bookings newest first, older ones left out', () => {
    expect(news.bookings?.map(b => b.label)).toEqual(['#13 · B invoice-i1-pay-1', '#12 · B bill-b2-pay-1']);
  });
  it('finds payments through their new booking, outgoing negative', () => {
    expect(news.payments).toEqual([
      { key: 'i1-invoice-i1-pay-1', label: 'Muster AG · Beitrag', amount: 30000, createdAt: '20261021093000' },
      { key: 'b2-bill-b2-pay-1', label: 'Migros · R-7', amount: -5000, createdAt: '20261020110000' },
    ]);
  });
  it('lists new bills and invoices; a document without createdAt is never new', () => {
    expect(news.bills?.map(b => [b.key, b.label, b.amount])).toEqual([['b1', 'EKZ · Strom', 12000]]);
    expect(news.invoices?.map(i => i.key)).toEqual(['i1']);
  });
  it('lists submitted expenses only', () => {
    expect(news.expenses?.map(e => [e.key, e.label, e.amount])).toEqual([['e1', 'Anna · Taxi', 4550]]);
  });
  it('keeps a failed source undefined', () => {
    const partial = summarizeNews({ since, bookings: undefined, bills, invoices: undefined, expenses: undefined });
    expect(partial.bookings).toBeUndefined();
    expect(partial.payments).toBeUndefined();
    expect(partial.invoices).toBeUndefined();
    expect(partial.bills?.length).toBe(1);
  });
});
