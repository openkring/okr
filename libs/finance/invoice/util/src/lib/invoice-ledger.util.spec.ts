import { describe, expect, it } from 'vitest';

import { InvoiceModel, InvoicePayment, InvoiceReminder } from '@okr/shared-models';

import { hasInvoiceVoucher, invoiceAccountKeys, invoiceBookingAmounts, invoiceBookingKeys, invoiceVoucherKeys, invoiceDisplayState, isOverdueInvoice } from './invoice-ledger.util';

function invoice(patch: Partial<InvoiceModel>): InvoiceModel {
  return Object.assign(new InvoiceModel('scs'), { okey: 'inv1' }, patch);
}

function reminder(patch: Partial<InvoiceReminder>): InvoiceReminder {
  return { level: 1, date: '20260101', dueDate: '20260110', isSent: false, documentKey: '', fee: 0, bookingKey: '', waivedAt: '', waiveBookingKey: '', ...patch };
}

function payment(bookingKey: string): InvoicePayment {
  return { date: '20260105', amount: 100, bankAccountKey: 'scs-1020', bookingKey };
}

describe('isOverdueInvoice', () => {
  it('is overdue when an open invoice is past its due date', () => {
    expect(isOverdueInvoice(invoice({ state: 'pending', dueDate: '20261003' }), '20261004')).toBe(true);
    expect(isOverdueInvoice(invoice({ state: 'partial', dueDate: '20261003' }), '20261004')).toBe(true);
    expect(isOverdueInvoice(invoice({ state: 'unpaid', dueDate: '20261003' }), '20261004')).toBe(true);
  });

  it('is not overdue on the due date itself', () => {
    expect(isOverdueInvoice(invoice({ state: 'pending', dueDate: '20261004' }), '20261004')).toBe(false);
  });

  it('is never overdue when paid, cancelled or a draft', () => {
    for (const state of ['paid', 'cancelled', 'draft', 'issuing']) {
      expect(isOverdueInvoice(invoice({ state, dueDate: '20200101' }), '20261004')).toBe(false);
    }
  });

  it('is not overdue without a due date', () => {
    expect(isOverdueInvoice(invoice({ state: 'pending', dueDate: '' }), '20261004')).toBe(false);
  });

  it('keeps a stored overdue state (bexio)', () => {
    expect(isOverdueInvoice(invoice({ state: 'overdue', dueDate: '' }), '20261004')).toBe(true);
  });
});

describe('invoiceDisplayState', () => {
  it('shows overdue for an open invoice past its due date', () => {
    expect(invoiceDisplayState(invoice({ state: 'pending', dueDate: '20261001' }), '20261004')).toBe('overdue');
  });

  it('keeps the stored state otherwise', () => {
    expect(invoiceDisplayState(invoice({ state: 'pending', dueDate: '20261010' }), '20261004')).toBe('pending');
    expect(invoiceDisplayState(invoice({ state: 'paid', dueDate: '20261001' }), '20261004')).toBe('paid');
  });
});

describe('invoiceBookingKeys', () => {
  it('is empty for a draft or a migrated invoice', () => {
    expect(invoiceBookingKeys(invoice({ state: 'draft' }))).toEqual([]);
  });

  it('lists issue, payment, reminder fee and waiver bookings in order', () => {
    const inv = invoice({
      state: 'pending',
      bookingKey: 'invoice-inv1',
      payments: [payment('invoice-inv1-pay-a'), payment('bank-x')],
      reminders: [reminder({ level: 1, bookingKey: 'invoice-inv1-reminder-1', waiveBookingKey: 'invoice-inv1-reminder-1-waiver' })],
    });
    expect(invoiceBookingKeys(inv)).toEqual([
      'invoice-inv1', 'invoice-inv1-pay-a', 'bank-x', 'invoice-inv1-reminder-1', 'invoice-inv1-reminder-1-waiver',
    ]);
  });

  it('lists the bexio bookings of a migrated invoice, then its payments', () => {
    const inv = invoice({ state: 'paid', bookingKeys: ['6278', '6279'], payments: [payment('6300')] });
    expect(invoiceBookingKeys(inv)).toEqual(['6278', '6279', '6300']);
  });

  it('adds the storno booking of a cancelled invoice', () => {
    expect(invoiceBookingKeys(invoice({ state: 'cancelled', bookingKey: 'invoice-inv1' }))).toEqual(['invoice-inv1', 'invoice-inv1-storno']);
    expect(invoiceBookingKeys(invoice({ state: 'cancelled', bookingKeys: ['6278'] }))).toEqual(['6278']);
  });

  it('skips empty keys, duplicates and legacy docs without the arrays', () => {
    const inv = invoice({ state: 'paid', bookingKey: 'invoice-inv1', payments: [payment(''), payment('invoice-inv1')] });
    (inv as Partial<InvoiceModel>).reminders = undefined;
    (inv as Partial<InvoiceModel>).bookingKeys = undefined;
    expect(invoiceBookingKeys(inv)).toEqual(['invoice-inv1']);
  });
});

describe('invoiceAccountKeys', () => {
  it('lists the bank accounts of the payments once each', () => {
    const p = (bankAccountKey: string) => ({ ...payment(''), bankAccountKey });
    expect(invoiceAccountKeys(invoice({ payments: [p('scs0077'), p(''), p('scs0077'), p('scs0078')] }))).toEqual(['scs0077', 'scs0078']);
  });

  it('is empty without payments (also on legacy docs)', () => {
    const inv = invoice({});
    (inv as Partial<InvoiceModel>).payments = undefined;
    expect(invoiceAccountKeys(inv)).toEqual([]);
  });
});

describe('invoiceBookingAmounts', () => {
  it('maps each payment booking to the invoice\'s own amount, skipping empty keys', () => {
    const inv = invoice({ payments: [payment('bank-x'), payment(''), { ...payment('bank-y'), amount: 30 }, payment('bank-y')] });
    expect(invoiceBookingAmounts(inv)).toEqual({ 'bank-x': 100, 'bank-y': 130 });
  });

  it('is empty for a legacy invoice without payments', () => {
    const inv = invoice({});
    (inv as Partial<InvoiceModel>).payments = undefined;
    expect(invoiceBookingAmounts(inv)).toEqual({});
  });
});

describe('invoiceVoucherKeys', () => {
  it('lists the invoice PDF, then the reminder PDFs, once each and without empty keys', () => {
    const inv = invoice({ documentKey: 'invoice-inv1', reminders: [reminder({ documentKey: 'rem-1' }), reminder({ level: 2 }), reminder({ level: 3, documentKey: 'rem-1' })] });
    expect(invoiceVoucherKeys(inv)).toEqual(['invoice-inv1', 'rem-1']);
    expect(hasInvoiceVoucher(inv)).toBe(true);
  });

  it('is empty for a draft, a legacy invoice and no invoice', () => {
    const legacy = invoice({});
    (legacy as Partial<InvoiceModel>).reminders = undefined;
    (legacy as Partial<InvoiceModel>).documentKey = undefined;
    expect(invoiceVoucherKeys(invoice({ state: 'draft' }))).toEqual([]);
    expect(invoiceVoucherKeys(legacy)).toEqual([]);
    expect(invoiceVoucherKeys(undefined)).toEqual([]);
    expect(hasInvoiceVoucher(legacy)).toBe(false);
  });
});
