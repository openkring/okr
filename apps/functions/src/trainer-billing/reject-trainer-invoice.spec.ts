import { describe, expect, it } from 'vitest';

import { markPaidRefusal } from './mark-trainer-invoice-paid';
import { rejectRefusal } from './reject-trainer-invoice';
import { mayManageTrainerInvoices } from './treasurer-caller';

describe('rejectRefusal', () => {
  it('refuses an invoice that is not sent', () => {
    expect(rejectRefusal({ state: 'booked', billKey: 'ti-x' }, { state: 'draft' })).toBe('not-sent');
    expect(rejectRefusal({ state: 'rejected', billKey: '' })).toBe('not-sent');
  });
  it('refuses a bill that has left draft, or carries bookings or payments', () => {
    expect(rejectRefusal({ state: 'sent', billKey: 'ti-x' }, { state: 'todo' })).toBe('bill-booked');
    expect(rejectRefusal({ state: 'sent', billKey: 'ti-x' }, { state: 'draft', bookingKeys: ['b1'] })).toBe('bill-booked');
    expect(rejectRefusal({ state: 'sent', billKey: 'ti-x' }, { state: 'draft', payments: [{}] })).toBe('bill-booked');
  });
  it('allows a sent invoice with an untouched draft, with a vanished bill, and in bexio books', () => {
    expect(rejectRefusal({ state: 'sent', billKey: 'ti-x' }, { state: 'draft', bookingKeys: [], payments: [] })).toBe('');
    expect(rejectRefusal({ state: 'sent', billKey: 'ti-x' })).toBe('');
    expect(rejectRefusal({ state: 'sent', billKey: '' })).toBe('');
  });
});

describe('markPaidRefusal', () => {
  it('works only in books kept outside Kring, on a sent invoice', () => {
    expect(markPaidRefusal('native', 'sent')).toBe('native-books');
    expect(markPaidRefusal(undefined, 'sent')).toBe('native-books');
    expect(markPaidRefusal('bexio', 'paid')).toBe('not-sent');
    expect(markPaidRefusal('bexio', 'sent')).toBe('');
  });
});

describe('mayManageTrainerInvoices', () => {
  const invoice = { tenants: ['scs'] };
  it('allows treasurer and admin of the invoice tenant', () => {
    expect(mayManageTrainerInvoices({ tenantId: 'scs', roles: { treasurer: true } }, invoice)).toBe(true);
    expect(mayManageTrainerInvoices({ tenantId: 'scs', roles: { admin: true } }, invoice)).toBe(true);
  });
  it('refuses other roles, other tenants and no tenant', () => {
    expect(mayManageTrainerInvoices({ tenantId: 'scs', roles: { privileged: true } }, invoice)).toBe(false);
    expect(mayManageTrainerInvoices({ tenantId: 'kring', roles: { treasurer: true } }, invoice)).toBe(false);
    expect(mayManageTrainerInvoices({ tenantId: '', roles: { admin: true } }, { tenants: [''] })).toBe(false);
  });
});
