import { describe, it, expect } from 'vitest';
import { BillModel } from '@okr/shared-models';
import { billAccountKeys, billBookingKeys, billDisplayState, getBillIndex, isOverdueBill, newBill } from './bill.util';

describe('newBill', () => {
  it('creates a BillModel with the given tenantId', () => {
    const bill = newBill('scs');
    expect(bill.tenants).toEqual(['scs']);
  });

  it('initializes with default state draft', () => {
    const bill = newBill('scs');
    expect(bill.state).toBe('draft');
  });
});

describe('getBillIndex', () => {
  it('returns empty string for empty bill', () => {
    const bill = newBill('scs');
    expect(getBillIndex(bill)).toBe('');
  });

  it('includes billId in index', () => {
    const bill = newBill('scs');
    bill.billId = 'RE-2024-001';
    const index = getBillIndex(bill);
    expect(index).toContain('RE-2024-001');
  });
});

describe('isOverdueBill / billDisplayState', () => {
  const bill = (state: BillModel['state'], dueDate: string) => Object.assign(newBill('scs'), { state, dueDate });

  it('is overdue when a bill to pay is past its due date', () => {
    expect(isOverdueBill(bill('todo', '20261003'), '20261004')).toBe(true);
    expect(billDisplayState(bill('todo', '20261003'), '20261004')).toBe('overdue');
  });

  it('is not overdue on the due date, without one, or when paid or a draft', () => {
    expect(isOverdueBill(bill('todo', '20261004'), '20261004')).toBe(false);
    expect(isOverdueBill(bill('todo', ''), '20261004')).toBe(false);
    expect(isOverdueBill(bill('paid', '20200101'), '20261004')).toBe(false);
    expect(isOverdueBill(bill('draft', '20200101'), '20261004')).toBe(false);
    expect(billDisplayState(bill('paid', '20200101'), '20261004')).toBe('paid');
  });

  it('keeps a stored overdue state (bexio)', () => {
    expect(isOverdueBill(bill('overdue', ''), '20261004')).toBe(true);
  });
});

describe('billAccountKeys', () => {
  it('splits the comma-separated booking accounts', () => {
    const b = Object.assign(newBill('scs'), { bookingAccount: 'scs0101, scs0201,,scs0101' });
    expect(billAccountKeys(b)).toEqual(['scs0101', 'scs0201']);
  });

  it('is empty without booking accounts (also on legacy docs)', () => {
    expect(billAccountKeys(newBill('scs'))).toEqual([]);
    expect(billAccountKeys(Object.assign(newBill('scs'), { bookingAccount: undefined }))).toEqual([]);
  });
});

describe('billBookingKeys', () => {
  it('lists the bill bookings, then the payment bookings, once each', () => {
    const b = Object.assign(newBill('scs'), {
      bookingKeys: ['12046', '12047'],
      payments: [{ date: '20260914', amount: 100, type: 'RECONCILED', bookingKey: '12065' }, { date: '20260915', amount: 1, type: '' }, { date: '20260916', amount: 1, type: '', bookingKey: '12065' }],
    });
    expect(billBookingKeys(b)).toEqual(['12046', '12047', '12065']);
  });

  it('is empty for an unlinked or legacy bill', () => {
    expect(billBookingKeys(newBill('scs'))).toEqual([]);
    expect(billBookingKeys(Object.assign(newBill('scs'), { bookingKeys: undefined, payments: undefined }))).toEqual([]);
  });
});
