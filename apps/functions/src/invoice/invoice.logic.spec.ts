import { describe, expect, it } from 'vitest';
import { buildInvoicePayload, draftWriteRefusal, finalizeDecision, invoiceBookingIndex, invoiceBookingLines, issueBlockers, issueHeaderBlockers, issueOutcome, issuePeriodKeys, recipientFields, totalRappen, withoutUndefined } from './invoice.logic';

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

describe('draftWriteRefusal', () => {
  it('allows creating and updating/deleting a draft', () => {
    expect(draftWriteRefusal(undefined, 'create')).toBeUndefined();
    expect(draftWriteRefusal('draft', 'update')).toBeUndefined();
    expect(draftWriteRefusal('draft', 'delete')).toBeUndefined();
  });

  it('refuses to touch an issued invoice', () => {
    expect(draftWriteRefusal('pending', 'update')).toBe('not-a-draft');
    expect(draftWriteRefusal('pending', 'delete')).toBe('not-a-draft');
  });

  it('refuses update/delete of a missing invoice', () => {
    expect(draftWriteRefusal(undefined, 'update')).toBe('not-found');
    expect(draftWriteRefusal(undefined, 'delete')).toBe('not-found');
  });
});

describe('withoutUndefined', () => {
  it('drops undefined keys but keeps null, empty and zero values', () => {
    expect(withoutUndefined({ a: 1, b: undefined, c: null, d: '', e: 0 })).toEqual({ a: 1, c: null, d: '', e: 0 });
    expect('b' in withoutUndefined({ b: undefined })).toBe(false);
  });
});

describe('issueOutcome', () => {
  it('issues a draft and resumes an interrupted issue', () => {
    expect(issueOutcome('draft')).toBe('issue');
    expect(issueOutcome('issuing')).toBe('issue');
  });
  it('returns the stored result for an issued invoice (double click, retried call)', () => {
    expect(issueOutcome('pending')).toBe('already-issued');
    expect(issueOutcome('paid')).toBe('already-issued');
  });
  it('refuses a cancelled or unknown state', () => {
    expect(issueOutcome('cancelled')).toBe('refuse');
    expect(issueOutcome('created')).toBe('refuse');
    expect(issueOutcome('')).toBe('refuse');
  });
});

describe('issueHeaderBlockers', () => {
  const ok = { receiverKey: 'p1', invoiceDate: '20261001', dueDate: '20261031', invoiceTemplateId: 'scs-rechnung' };
  it('accepts a complete header', () => {
    expect(issueHeaderBlockers(ok)).toEqual([]);
  });
  it('refuses an invoice without receiver', () => {
    expect(issueHeaderBlockers({ ...ok, receiverKey: undefined })).toContain('no-receiver');
    expect(issueHeaderBlockers({ ...ok, receiverKey: '  ' })).toContain('no-receiver');
  });
  it('refuses an empty or malformed invoice date', () => {
    expect(issueHeaderBlockers({ ...ok, invoiceDate: '' })).toContain('no-invoice-date');
    expect(issueHeaderBlockers({ ...ok, invoiceDate: '2026-10-01' })).toContain('no-invoice-date');
  });
  it('refuses when no invoice template is configured', () => {
    expect(issueHeaderBlockers({ ...ok, invoiceTemplateId: '' })).toContain('no-invoice-template');
  });
  it('refuses an invoice without due date', () => {
    expect(issueHeaderBlockers({ ...ok, dueDate: '' })).toContain('no-due-date');
    expect(issueHeaderBlockers({ ...ok, dueDate: undefined })).toContain('no-due-date');
  });
  it('refuses a due date before the invoice date, accepts the same day', () => {
    expect(issueHeaderBlockers({ ...ok, dueDate: '20260930' })).toEqual(['due-before-invoice-date']);
    expect(issueHeaderBlockers({ ...ok, dueDate: '20261001' })).toEqual([]);
  });
  it('does not compare dates when the invoice date is missing', () => {
    expect(issueHeaderBlockers({ ...ok, invoiceDate: '', dueDate: '20260101' })).toEqual(['no-invoice-date']);
  });
});

describe('finalizeDecision', () => {
  const expected = { expectedInvoiceNo: 202600007, expectedRunId: 'run-a', bookingExists: false };
  const issuing = { state: 'issuing', invoiceNo: 202600007, issueRunId: 'run-a' };
  it('writes nothing when a concurrent run already issued the invoice (double click, retried call)', () => {
    expect(finalizeDecision({ ...issuing, state: 'pending' }, expected)).toBe('return-stored');
    expect(finalizeDecision({ ...issuing, state: 'paid' }, expected)).toBe('return-stored');
  });
  it('refuses when the invoice changed under this run', () => {
    expect(finalizeDecision({ ...issuing, invoiceNo: 202600008 }, expected)).toBe('refuse');
    expect(finalizeDecision({ ...issuing, issueRunId: 'run-b' }, expected)).toBe('refuse');
    expect(finalizeDecision({ ...issuing, state: 'draft' }, expected)).toBe('refuse');
    expect(finalizeDecision({ ...issuing, state: 'cancelled' }, expected)).toBe('refuse');
  });
  it('never writes the booking twice', () => {
    expect(finalizeDecision(issuing, { ...expected, bookingExists: true })).toBe('write-without-booking');
  });
  it('writes everything on the normal path', () => {
    expect(finalizeDecision(issuing, expected)).toBe('write');
  });
});

describe('issuePeriodKeys', () => {
  it('names the annual period of the invoice date (locked year → refused by assertPeriodsOpen)', () => {
    expect(issuePeriodKeys('scs', '20251231', 1)).toEqual(['scs-2025']);
    expect(issuePeriodKeys('scs', '20260101', 1)).toEqual(['scs-2026']);
  });
  it('follows a fiscal year that starts in July', () => {
    expect(issuePeriodKeys('scs', '20260630', 7)).not.toEqual(issuePeriodKeys('scs', '20260701', 7));
    expect(issuePeriodKeys('scs', '20260701', 7)).toEqual(issuePeriodKeys('scs', '20270630', 7));
  });
});

describe('invoiceBookingIndex', () => {
  it('follows the journal index format and finds the invoice by title and number', () => {
    expect(invoiceBookingIndex('20261001', 42, 'Mitgliederbeitrag 2026', '202600007'))
      .toBe('d:20261001 no:42 n:Mitgliederbeitrag 2026 i:202600007');
  });
});

describe('recipientFields', () => {
  it('greets a person by first name and carries the address', () => {
    const r = recipientFields({ name1: 'Anna', name2: 'Muster', modelType: 'person' }, { streetName: 'Weg', streetNumber: '3', zipCode: '8000', city: 'Zürich', countryCode: 'CH' });
    expect(r).toMatchObject({ firstName: 'Anna', lastName: 'Muster', greeting: 'Liebe/r Anna', streetName: 'Weg', streetNumber: '3', zipCode: '8000', city: 'Zürich', countryCode: 'CH' });
  });
  it('greets an org neutrally and defaults a missing address', () => {
    const r = recipientFields({ name1: '', name2: 'Verein', modelType: 'org' });
    expect(r['greeting']).toBe('Guten Tag');
    expect(r).toMatchObject({ streetName: '', city: '', countryCode: 'CH' });
  });
});
