import { describe, expect, it } from 'vitest';

import { chfText, emailDetails, historyDetails, historyEntry, zurichStoreDateTime } from './finance-history.logic';

describe('zurichStoreDateTime', () => {
  it('formats in Swiss summer time (UTC+2)', () => expect(zurichStoreDateTime(new Date('2026-10-07T20:05:09Z'))).toBe('20261007220509'));
  it('formats in Swiss winter time (UTC+1), across midnight', () => expect(zurichStoreDateTime(new Date('2026-12-31T23:30:00Z'))).toBe('20270101003000'));
});

describe('historyDetails', () => {
  it('joins the non-empty parts and collapses whitespace', () => expect(historyDetails('a', '', undefined, false, ' b \n c ')).toBe('a · b c'));
  it('caps the length', () => expect(historyDetails('x'.repeat(2000)).length).toBe(1000));
});

describe('emailDetails', () => {
  it('lists recipients, subject and files', () => {
    expect(emailDetails({ to: ['a@b.ch'], cc: ['c@d.ch'], bcc: [], subject: 'Rechnung 7', filename: '7.pdf', extraFiles: ['x.png'] }))
      .toBe('→ a@b.ch · Cc: c@d.ch · «Rechnung 7» · 7.pdf, x.png');
  });
  it('leaves out what is missing', () => expect(emailDetails({ to: ['a@b.ch'] })).toBe('→ a@b.ch'));
});

describe('chfText', () => {
  it('formats Rappen with a Swiss thousands separator', () => expect(chfText(123450)).toBe('CHF 1’234.50'));
  it('keeps the sign', () => expect(chfText(-2550)).toBe('-CHF 25.50'));
});

describe('historyEntry', () => {
  it('builds a system entry with an i18n key and details', () => {
    expect(historyEntry({ tenantId: 'scs', parentKey: 'invoice.k', kind: 'email', details: '→ a@b.ch', authorKey: 'p1', authorName: 'Bruno Kaiser', now: new Date('2026-10-07T08:00:00Z') }))
      .toEqual({
        index: '', authorKey: 'p1', authorName: 'Bruno Kaiser', creationDateTime: '20261007100000', parentKey: 'invoice.k',
        description: '@finance/accounting/feature.history.email → a@b.ch', attachmentKeys: [], isArchived: false,
        tags: 'system,email', tenants: ['scs'],
      });
  });
  it('has only the key without details', () => {
    expect(historyEntry({ tenantId: 'scs', parentKey: 'bill.b', kind: 'billBooked', authorKey: '', authorName: '', now: new Date() }).description)
      .toBe('@finance/accounting/feature.history.billBooked');
  });
});
