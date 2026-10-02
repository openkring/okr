import { describe, expect, it } from 'vitest';
import { buildConfirmationPayload, confirmationDocumentFields, confirmationPayDate, confirmationRefusal } from './payment-confirmation.logic';

const invoice = {
  invoiceId: '20260012', title: 'Beitrag 2026', invoiceDate: '20260105', paymentDate: '20260210',
  totalAmount: { amount: 100000, currency: 'CHF' }, state: 'paid', receiver: { key: 'p1', name1: 'Anna', name2: 'Muster', modelType: 'person' },
};

describe('confirmationRefusal', () => {
  it('accepts a paid invoice with a receiver', () => expect(confirmationRefusal('paid', 'p1')).toBeUndefined());
  it('refuses anything but paid', () => {
    for (const s of ['draft', 'issuing', 'pending', 'cancelled', '']) expect(confirmationRefusal(s, 'p1')).toBe('not-paid');
  });
  it('refuses a missing receiver', () => {
    expect(confirmationRefusal('paid', undefined)).toBe('no-receiver');
    expect(confirmationRefusal('paid', '')).toBe('no-receiver');
  });
});

describe('confirmationPayDate', () => {
  it('prefers paymentDate', () => expect(confirmationPayDate({ paymentDate: '20260210', payments: [{ date: '20260101' }] })).toBe('20260210'));
  it('falls back to the last payment', () =>
    expect(confirmationPayDate({ payments: [{ date: '20260101' }, { date: '20260301' }] })).toBe('20260301'));
  it('is empty without any date', () => expect(confirmationPayDate({})).toBe(''));
});

describe('buildConfirmationPayload', () => {
  it('assembles invoice, recipient and static fields', () => {
    const p = buildConfirmationPayload(invoice, '20260210', { streetName: 'Weg', streetNumber: '3', zipCode: '8000', city: 'Zürich', countryCode: 'CH' }, 'female');
    expect(p['amount']).toBe("1'000.00");
    expect(p['invoiceId']).toBe('20260012');
    expect(p['invoiceTitle']).toBe('Beitrag 2026');
    expect(p['invoiceDate']).toBe('05.01.2026');
    expect(p['payDate']).toBe('10.02.2026');
    expect(p['greeting']).toBe('Liebe Anna');
    expect(p['lastName']).toBe('Muster');
    expect(p['city']).toBe('Zürich');
    expect(p['logoUrl']).toContain('logo');
  });
  it('renders with empty address fields and an org greeting', () => {
    const p = buildConfirmationPayload({ ...invoice, receiver: { key: 'o1', name1: '', name2: 'Verein AG', modelType: 'org' } }, '20260210', undefined, undefined);
    expect(p['streetName']).toBe('');
    expect(p['greeting']).toBe('Sehr geehrte Damen und Herren');
    expect(p['lastName']).toBe('Verein AG');
  });
});

describe('confirmationDocumentFields', () => {
  it('mirrors the invoice pdf document with the confirmation path and tag', () => {
    const d = confirmationDocumentFields({ tenants: ['scs'], accountingTenantId: 'scs', fullPath: 'tenant/scs/private/finance/invoices/k-confirmation.pdf', filename: '20260012-confirmation.pdf', sizeBytes: 42, today: '20261002' });
    expect(d).toMatchObject({
      tenants: ['scs'], accountingTenantId: 'scs', isArchived: false, tags: 'invoice', type: 'finance', source: 'storage',
      mimeType: 'application/pdf', size: 42, fullPath: 'tenant/scs/private/finance/invoices/k-confirmation.pdf',
      index: 'n:20260012-confirmation.pdf', title: '20260012-confirmation.pdf', dateOfDocCreation: '20261002',
    });
  });
});
