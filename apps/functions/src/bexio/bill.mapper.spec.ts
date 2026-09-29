import { describe, expect, it } from 'vitest';
import { billDoc, mapBillState } from './bill.mapper';

const bill = {
  id: 7, document_no: 'LR-7', title: null, status: 'PAID', vendor: 'Muster AG', overdue: false,
  bill_date: '2026-09-01', due_date: '2026-09-30', gross: '120.50',
  attachment_ids: ['u-1'], booking_account_ids: [256], created_at: '2026-09-01 10:00:00',
};

describe('mapBillState', () => {
  it('never leaks a bexio status', () => {
    expect(mapBillState('PAID')).toBe('paid');
    expect(mapBillState('DRAFT')).toBe('draft');
    expect(mapBillState('PARTIALLY_PAID', false)).toBe('todo');
    expect(mapBillState('FAILED', true)).toBe('overdue');
    expect(mapBillState('BOOKED')).toBe('todo');
  });
});

describe('billDoc', () => {
  it('maps a fresh bill including the bexio-owned fields', () => {
    const d = billDoc(bill, 'scs', undefined);
    expect(d['state']).toBe('paid');
    expect(d['billDate']).toBe('20260901');
    expect(d['totalAmount']).toEqual({ amount: 12050, currency: 'CHF', periodicity: 'one-time' });
    expect(d['attachments']).toEqual(['u-1']);
    expect(d['bookingAccount']).toBe('256');
    expect(d['bexioVender']).toBe('Muster AG');
    expect(d['title']).toBe('LR-7');
  });
  it('leaves migrated fields alone once the bill has a vendor', () => {
    const d = billDoc(bill, 'scs', { vendor: { key: 'o1' } });
    expect(d).not.toHaveProperty('attachments');
    expect(d).not.toHaveProperty('bookingAccount');
    expect(d).not.toHaveProperty('bexioVender');
    expect(d['state']).toBe('paid');
  });
});

describe('billDoc after the migration', () => {
  it('keeps migrated attachments and account okeys even when the vendor stayed unresolved', () => {
    const d = billDoc(bill, 'scs', { attachments: ['bexio-file-1'], bookingAccount: 'scs0256', notes: 'bexio supplier 88' });
    expect(d).not.toHaveProperty('attachments');
    expect(d).not.toHaveProperty('bookingAccount');
    expect(d).not.toHaveProperty('bexioVender');
  });
  it('still maps legacy fields on an unmigrated bill', () => {
    const d = billDoc(bill, 'scs', { attachments: ['u-1'], bookingAccount: '256' });
    expect(d['attachments']).toEqual(['u-1']);
    expect(d['bookingAccount']).toBe('256');
  });
});
