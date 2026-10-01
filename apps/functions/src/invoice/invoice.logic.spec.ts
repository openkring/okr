import { describe, expect, it } from 'vitest';
import { buildInvoicePayload, invoiceBookingLines, issueBlockers, totalRappen } from './invoice.logic';

const pos = (amount: number, accountKey = 'scs3401', name = 'Beitrag') => ({ name, amount, accountKey });

describe('totalRappen', () => {
  it('sums CHF decimals without float drift', () => {
    expect(totalRappen([pos(0.1), pos(0.2)])).toBe(30);
    expect(totalRappen([pos(600), pos(75.5)])).toBe(67550);
  });
});

describe('issueBlockers', () => {
  it('accepts a complete draft', () => {
    expect(issueBlockers([pos(600)], 'scs0093')).toEqual([]);
  });
  it('names every reason an invoice cannot be issued', () => {
    expect(issueBlockers([], 'scs0093')).toContain('no-positions');
    expect(issueBlockers([pos(600, '')], 'scs0093')).toContain('position-without-account');
    expect(issueBlockers([pos(0)], 'scs0093')).toContain('total-not-positive');
    expect(issueBlockers([pos(600)], '')).toContain('no-receivables-account');
  });
});

describe('issueBlockers hardening', () => {
  it('flags NaN, Infinity and zero amounts', () => {
    expect(issueBlockers([pos(NaN), pos(600)], 'scs0093')).toContain('invalid-amount');
    expect(issueBlockers([pos(Infinity), pos(600)], 'scs0093')).toContain('invalid-amount');
    expect(issueBlockers([pos(0), pos(600)], 'scs0093')).toContain('invalid-amount');
  });
  it('treats a whitespace accountKey as missing', () => {
    expect(issueBlockers([pos(600, '   ')], 'scs0093')).toContain('position-without-account');
  });
});

describe('invoiceBookingLines', () => {
  it('turns a negative group into a debit and keeps the entry balanced', () => {
    const lines = invoiceBookingLines([pos(600, 'scs3401'), pos(-100, 'scs3409')], 'scs0093');
    expect(lines).toEqual([
      { accountKey: 'scs0093', debitAmount: { amount: 50000, currency: 'CHF' } },
      { accountKey: 'scs3401', creditAmount: { amount: 60000, currency: 'CHF' } },
      { accountKey: 'scs3409', debitAmount: { amount: 10000, currency: 'CHF' } },
    ]);
    const sum = (k: 'debitAmount' | 'creditAmount') => lines.reduce((s, l) => s + (l[k]?.amount ?? 0), 0);
    expect(sum('debitAmount')).toBe(sum('creditAmount'));
  });
  it('emits no line for a group netting to zero', () => {
    const lines = invoiceBookingLines([pos(600, 'scs3401'), pos(100, 'scs3409'), pos(-100, 'scs3409')], 'scs0093');
    expect(lines.map((l) => l.accountKey)).toEqual(['scs0093', 'scs3401']);
  });
  it('debits receivables with the total and credits each revenue account once', () => {
    const lines = invoiceBookingLines([pos(600, 'scs3401'), pos(75, 'scs3402'), pos(50, 'scs3401')], 'scs0093');
    expect(lines).toEqual([
      { accountKey: 'scs0093', debitAmount: { amount: 72500, currency: 'CHF' } },
      { accountKey: 'scs3401', creditAmount: { amount: 65000, currency: 'CHF' } },
      { accountKey: 'scs3402', creditAmount: { amount: 7500, currency: 'CHF' } },
    ]);
  });
});

describe('buildInvoicePayload', () => {
  const base = { invoiceId: '202600001', title: 'Jahresbeitrag 2026', invoiceDate: '20261001', dueDate: '20261031',
    receiver: { name1: 'Anna', name2: 'Muster', modelType: 'person' }, positions: [pos(600), pos(75.5, 'scs3402', 'Bootsplatz')] };

  it('fills the debtor, the swiss-formatted amount, positions and the QR message', () => {
    const p = buildInvoicePayload({ ...base, address: { streetName: 'Seestrasse', streetNumber: '5', zipCode: '8712', city: 'Stäfa', countryCode: 'CH' } });
    expect(p).toMatchObject({ firstName: 'Anna', lastName: 'Muster', streetName: 'Seestrasse', zipCode: '8712', city: 'Stäfa',
      invoiceNumber: '202600001', date: '01.10.2026', dueDate: '31.10.2026', amount: '675.50', qrMessage: 'Rechnung 202600001' });
    expect(p['positions']).toEqual([{ name: 'Beitrag', amount: '600.00' }, { name: 'Bootsplatz', amount: '75.50' }]);
  });

  it('uses the org name as lastName and still builds without an address', () => {
    const p = buildInvoicePayload({ ...base, receiver: { name1: '', name2: 'Ruderclub X', modelType: 'org' } });
    expect(p).toMatchObject({ firstName: '', lastName: 'Ruderclub X', zipCode: '', city: '' });
  });
});
