import { describe, expect, it } from 'vitest';

import { buildBankBookingHeader, buildBankBookingLines, fiscalYear, periodKeyFor, RowDoc } from './bank-import.util';

const row = (p: Partial<RowDoc>): RowDoc => ({
  importKey: 'k', date: '20250714', rawText: 'KAUF BEXIO AG', payee: 'BEXIO AG', title: 'Bexio', accountKey: '6570', vatCodeKey: 'VST',
  amount: { amount: -12975, currency: 'CHF' }, status: 'mapped', bankProfileKey: 'bp', accountingTenantId: 'bkg', tenants: ['bkg'], ...p,
});
const profile = { accountKey: '1020', accountingTenantId: 'bkg' };

describe('fiscalYear / periodKeyFor', () => {
  it('calendar year when the fiscal year starts in January', () => {
    expect(fiscalYear('20250714', 1)).toBe(2025);
    expect(periodKeyFor('bkg', '20250714', 1)).toBe('bkg-2025');
  });
  it('a start month other than January assigns earlier months to the previous fiscal year', () => {
    expect(fiscalYear('20250301', 7)).toBe(2024);
    expect(fiscalYear('20250701', 7)).toBe(2025);
  });
});

describe('buildBankBookingLines', () => {
  it('Lastschrift: counter-account debit, bank account credit, VAT on the counter line only', () => {
    const lines = buildBankBookingLines(row({}), profile, 'bkg', 'bank-k');
    expect(lines).toEqual([
      { tenants: ['bkg'], isArchived: false, bookingKey: 'bank-k', accountKey: '6570', accountingTenantId: 'bkg', debitAmount: { amount: 12975, currency: 'CHF', periodicity: 'one-time' }, vatCodeKey: 'VST' },
      { tenants: ['bkg'], isArchived: false, bookingKey: 'bank-k', accountKey: '1020', accountingTenantId: 'bkg', creditAmount: { amount: 12975, currency: 'CHF', periodicity: 'one-time' } },
    ]);
  });
  it('Gutschrift: bank account debit, counter-account credit', () => {
    const lines = buildBankBookingLines(row({ amount: { amount: 97500, currency: 'CHF' }, vatCodeKey: '' }), profile, 'bkg', 'bank-k');
    expect(lines[0]).toMatchObject({ accountKey: '1020', debitAmount: { amount: 97500 } });
    expect(lines[1]).toMatchObject({ accountKey: '6570', creditAmount: { amount: 97500 } });
    expect(lines[1]).not.toHaveProperty('vatCodeKey');
  });
  it('amountFx is copied onto both lines as an absolute amount', () => {
    const lines = buildBankBookingLines(row({ amount: { amount: -731, currency: 'CHF' }, amountFx: { amount: -900, currency: 'USD' } }), profile, 'bkg', 'bank-k');
    expect(lines[0]).toMatchObject({ amountFx: { amount: 900, currency: 'USD', periodicity: 'one-time' } });
    expect(lines[1]).toMatchObject({ amountFx: { amount: 900, currency: 'USD', periodicity: 'one-time' } });
  });
});

describe('buildBankBookingHeader', () => {
  it('title, date, notes = raw text, counterparty from payee, tag bank-import, status posted', () => {
    expect(buildBankBookingHeader(row({}), 'bkg', 'bkg-2025')).toEqual({
      title: 'Bexio', date: '20250714', notes: 'KAUF BEXIO AG', periodKey: 'bkg-2025', documentKey: '', tags: 'bank-import', index: '',
      counterparty: { key: '', name1: '', name2: 'BEXIO AG', modelType: 'org', type: '', subType: '', label: 'BEXIO AG' },
      status: 'posted', accountingTenantId: 'bkg', tenants: ['bkg'], isArchived: false,
    });
  });
  it('no payee → no counterparty', () => {
    expect(buildBankBookingHeader(row({ payee: '' }), 'bkg', 'bkg-2025')).not.toHaveProperty('counterparty');
  });
});
