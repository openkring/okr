import { describe, expect, it } from 'vitest';

import { invoiceMatchesBill, mirrorUpdate } from './on-bill-written';
import { profileTenants } from './on-trainer-agreement-written';

describe('profileTenants', () => {
  it('includes archived agreements, unions and sorts', () => {
    expect(profileTenants([
      { tenants: ['scs', 'gss'], isArchived: false },
      { tenants: ['scs', 'zzz'], isArchived: true },
      { tenants: ['abc', 'scs'], isArchived: false },
    ])).toEqual(['abc', 'gss', 'scs', 'zzz']);
  });
  it('keeps the tenants when all agreements are archived (erasure/export still find the profile)', () => {
    expect(profileTenants([
      { tenants: ['scs'], isArchived: true },
      { tenants: ['gss', ''], isArchived: true },
    ])).toEqual(['gss', 'scs']);
  });
  it('is empty without agreements', () => expect(profileTenants([])).toEqual([]));
});

describe('mirrorUpdate', () => {
  it('booked after the bill was booked', () => {
    expect(mirrorUpdate({ trainerInvoiceKey: 'i1', state: 'draft' }, { trainerInvoiceKey: 'i1', state: 'todo' })).toBe('booked');
  });
  it('sent when the booking is deleted again', () => {
    expect(mirrorUpdate({ trainerInvoiceKey: 'i1', state: 'todo' }, { trainerInvoiceKey: 'i1', state: 'draft' })).toBe('sent');
  });
  it('paid and overdue', () => {
    expect(mirrorUpdate(undefined, { trainerInvoiceKey: 'i1', state: 'paid' })).toBe('paid');
    expect(mirrorUpdate(undefined, { trainerInvoiceKey: 'i1', state: 'overdue' })).toBe('booked');
  });
  it('undefined without trainerInvoiceKey or when deleted', () => {
    expect(mirrorUpdate({ state: 'draft' }, { state: 'todo' })).toBeUndefined();
    expect(mirrorUpdate({ trainerInvoiceKey: 'i1', state: 'draft' }, undefined)).toBeUndefined();
  });
});

describe('invoiceMatchesBill', () => {
  it('needs billKey and books to match', () => {
    expect(invoiceMatchesBill({ billKey: 'b1', accountingTenantId: 'scs' }, 'b1', { accountingTenantId: 'scs' })).toBe(true);
    expect(invoiceMatchesBill({ billKey: 'b2', accountingTenantId: 'scs' }, 'b1', { accountingTenantId: 'scs' })).toBe(false);
    expect(invoiceMatchesBill({ billKey: 'b1', accountingTenantId: 'gss' }, 'b1', { accountingTenantId: 'scs' })).toBe(false);
    expect(invoiceMatchesBill(undefined, 'b1', { accountingTenantId: 'scs' })).toBe(false);
  });
});
