import { describe, expect, it, vi } from 'vitest';

import { AddressModel, InvoiceModel, PersonModel } from '@okr/shared-models';
import * as utilCore from '@okr/shared-util-core';

import { buildPaymentConfirmationPayload, canCreatePaymentConfirmation } from './payment-confirmation.util';

// @okr/shared-util-core re-exports platform.util which imports @angular/common (isPlatformBrowser).
vi.mock('@okr/shared-util-core', async () => {
  const actual = await vi.importActual<typeof utilCore>('@okr/shared-util-core');
  return { ...actual };
});
vi.mock('@angular/common', () => ({ isPlatformBrowser: vi.fn(() => true) }));

function paidInvoice(): InvoiceModel {
  const inv = new InvoiceModel('scs');
  inv.title = 'Jahresbeitrag 2026';
  inv.invoiceId = 'RE-0105';
  inv.invoiceDate = '20260616';
  inv.paymentDate = '20260701';
  inv.state = 'paid';
  inv.totalAmount = { amount: 100000, currency: 'CHF', periodicity: 'one-time' };
  inv.receiver = { key: 'p1', name1: 'Anna', name2: 'Muster', modelType: 'person', type: '', subType: '', label: '' };
  return inv;
}

function anna(): PersonModel {
  const p = new PersonModel('scs');
  p.firstName = 'Anna';
  p.lastName = 'Muster';
  p.gender = 'female';
  return p;
}

function addr(): AddressModel {
  const a = new AddressModel('scs');
  a.streetName = 'Seestrasse';
  a.streetNumber = '12';
  a.zipCode = '8712';
  a.city = 'Stäfa';
  return a;
}

describe('canCreatePaymentConfirmation', () => {
  it('is true for a paid invoice with a receiver', () => {
    expect(canCreatePaymentConfirmation(paidInvoice())).toBe(true);
  });

  it('is false for an unpaid invoice', () => {
    const inv = paidInvoice();
    inv.state = 'pending';
    expect(canCreatePaymentConfirmation(inv)).toBe(false);
  });

  it('is false without a receiver', () => {
    const inv = paidInvoice();
    inv.receiver = undefined;
    expect(canCreatePaymentConfirmation(inv)).toBe(false);
  });
});

describe('buildPaymentConfirmationPayload', () => {
  it('maps the invoice fields', () => {
    const payload = buildPaymentConfirmationPayload(paidInvoice(), { kind: 'person', person: anna() }, addr());
    expect(payload['invoiceId']).toBe('RE-0105');
    expect(payload['invoiceTitle']).toBe('Jahresbeitrag 2026');
    expect(payload['invoiceDate']).toBe('16.06.2026');
    expect(payload['payDate']).toBe('01.07.2026');
    expect(payload['amount']).toMatch(/^1.000\.00$/);
    expect(payload['date']).toBeUndefined();
  });

  it('maps the recipient and static fields', () => {
    const payload = buildPaymentConfirmationPayload(paidInvoice(), { kind: 'person', person: anna() }, addr());
    expect(payload['greeting']).toBe('Liebe Anna');
    expect(payload['lastName']).toBe('Muster');
    expect(payload['zipCode']).toBe('8712');
    expect(payload['logoUrl']).toContain('imgix');
  });

  it('leaves payDate empty when the invoice has no payment date', () => {
    const inv = paidInvoice();
    inv.paymentDate = '';
    expect(buildPaymentConfirmationPayload(inv, { kind: 'person', person: anna() }, addr())['payDate']).toBe('');
  });
});
