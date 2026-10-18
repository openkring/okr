import { describe, expect, it } from 'vitest';
import type { ExitSettlement, SettlementCase, SettlementChoice } from '@okr/relationship-membership-util';

import {
  appendInvoiceNote, appendTaskNote, choiceRefusal, decisionNote, extendedRelLog, isLiveRefund, membershipKeyOf,
  postalAddressText, refundMessageId, refundOrderId, refundPaymentId, refundReference, replacementPositions,
  resumableCancelled, storedDecision, stornoReason,
} from './settle-membership-exit.logic';

const settlement = (c: SettlementCase, choices: SettlementChoice[], extra: Partial<ExitSettlement> = {}): ExitSettlement => ({
  case: c, exitYear: 2026, months: 10, yearlyFr: 120, dueFr: 100, billedFr: 120, overpaidRappen: 2000,
  refundRappen: c === 'paid' ? 10000 : 0, choices, manualReason: c === 'manual' ? 'no-invoice' : '', shape: 'native',
  invoice: { okey: 'i1', invoiceId: '2026-17' } as ExitSettlement['invoice'], ...extra,
});

describe('choiceRefusal', () => {
  const paid = settlement('paid', ['refund', 'extend']);
  const unpaid = settlement('unpaid', ['adjust-invoice', 'extend']);

  it('refuses any choice on a done task', () => {
    expect(choiceRefusal(paid, 'refund', true, false)).toBe('task-done');
    expect(choiceRefusal(paid, 'extend', true, false)).toBe('task-done');
  });

  it('refuses a choice the case does not offer', () => {
    expect(choiceRefusal(unpaid, 'refund', false, false)).toBe('choice-not-offered');
    expect(choiceRefusal(paid, 'adjust-invoice', false, false)).toBe('choice-not-offered');
  });

  it('refuses a second refund on the same invoice', () => {
    expect(choiceRefusal(paid, 'refund', false, true)).toBe('already-refunded');
  });

  it('allows extend on a manual case', () => {
    expect(choiceRefusal(settlement('manual', ['extend']), 'extend', false, false)).toBeUndefined();
  });

  it('allows the offered choices', () => {
    expect(choiceRefusal(paid, 'refund', false, false)).toBeUndefined();
    expect(choiceRefusal(unpaid, 'adjust-invoice', false, false)).toBeUndefined();
  });

  it('refuses adjust-invoice on a bexio invoice even if offered', () => {
    expect(choiceRefusal({ ...unpaid, shape: 'bexio' }, 'adjust-invoice', false, false)).toBe('choice-not-offered');
  });

  it('refuses a refund of nothing or without an invoice', () => {
    expect(choiceRefusal({ ...paid, refundRappen: 0 }, 'refund', false, false)).toBe('choice-not-offered');
    expect(choiceRefusal({ ...paid, invoice: undefined }, 'refund', false, false)).toBe('choice-not-offered');
  });

  it('is idempotent: a second refund on the now done task returns task-done', () => {
    expect(choiceRefusal(paid, 'refund', false, false)).toBeUndefined();
    expect(choiceRefusal(paid, 'refund', true, true)).toBe('task-done');
  });
});

describe('ids', () => {
  it('refundPaymentId is deterministic', () => {
    expect(refundPaymentId('m1', 2026)).toBe('mref-m1-2026');
    expect(refundPaymentId('m1', 2026)).toBe(refundPaymentId('m1', 2026));
  });

  it('refundOrderId follows the collecting order pattern', () => {
    expect(refundOrderId('scs', '20261018', 1)).toBe('scs-mref-20261018-1');
  });

  it('refundMessageId stays within 35 characters', () => {
    const id = refundMessageId('abcdefghijklmnopqrst', '20261018', 1);
    expect(id.length).toBeLessThanOrEqual(35);
    expect(id.endsWith('-MREF-20261018-1')).toBe(true);
    expect(refundMessageId('scs', '20261018', 2)).toBe('SCS-MREF-20261018-2');
  });
});

describe('decisionNote', () => {
  it('names the decider, the date and the refund', () => {
    expect(decisionNote('refund', 'Bruno Kaiser', '18.10.2026', settlement('paid', ['refund', 'extend'])))
      .toBe('Entschieden von Bruno Kaiser am 18.10.2026: Rückerstattung CHF 100.00');
  });

  it('describes the replacement invoice', () => {
    const s = settlement('unpaid', ['adjust-invoice', 'extend']);
    expect(decisionNote('adjust-invoice', 'Bruno Kaiser', '18.10.2026', s))
      .toBe('Entschieden von Bruno Kaiser am 18.10.2026: Rechnung 2026-17 storniert, neue Rechnung über CHF 100.00 als Entwurf erstellt');
  });

  it('describes the extension', () => {
    expect(decisionNote('extend', 'Bruno Kaiser', '18.10.2026', settlement('manual', ['extend'])))
      .toBe('Entschieden von Bruno Kaiser am 18.10.2026: Austritt auf 31.12.2026 verschoben');
  });

  it('falls back when the decider has no name', () => {
    expect(decisionNote('extend', '  ', '18.10.2026', settlement('manual', ['extend']))).toContain('Entschieden von unbekannt am');
  });
});

describe('storedDecision / appendTaskNote', () => {
  it('returns the last decision line of the notes', () => {
    const notes = appendTaskNote('figures\n--- Notizen ---\nown text', 'Entschieden von A am 1.1.2026: Austritt auf 31.12.2026 verschoben');
    expect(notes).toBe('figures\n--- Notizen ---\nown text\nEntschieden von A am 1.1.2026: Austritt auf 31.12.2026 verschoben');
    expect(storedDecision(notes)).toBe('Entschieden von A am 1.1.2026: Austritt auf 31.12.2026 verschoben');
  });

  it('returns empty when no decision was stored', () => {
    expect(storedDecision('figures')).toBe('');
    expect(storedDecision(undefined)).toBe('');
    expect(appendTaskNote('', 'x')).toBe('x');
  });
});

describe('membershipKeyOf', () => {
  it('extracts the okey of a membership relatedKey', () => {
    expect(membershipKeyOf('membership.abc')).toBe('abc');
    expect(membershipKeyOf('person.abc')).toBe('');
    expect(membershipKeyOf('membership.')).toBe('');
    expect(membershipKeyOf(undefined)).toBe('');
  });
});

describe('extendedRelLog', () => {
  it('replaces the last exit entry with the 31.12. one', () => {
    expect(extendedRelLog('20200101:A,20261031:X', 2026)).toBe('20200101:A,20261231:X');
  });

  it('keeps earlier entries and appends when there is no exit entry', () => {
    expect(extendedRelLog('20200101:A', 2026)).toBe('20200101:A,20261231:X');
    expect(extendedRelLog('', 2026)).toBe('20261231:X');
  });

  it('removes only the last exit entry', () => {
    expect(extendedRelLog('20100101:J,20191231:X,20200101:A,20261031:X', 2026)).toBe('20100101:J,20191231:X,20200101:A,20261231:X');
  });
});

describe('texts', () => {
  it('refund reference and storno reason', () => {
    expect(refundReference(2026)).toBe('Rückerstattung Jahresbeitrag 2026 pro rata');
    expect(stornoReason('31.10.2026')).toBe('Austritt per 31.10.2026, pro rata');
  });

  it('appendInvoiceNote appends a line and keeps the limit', () => {
    expect(appendInvoiceNote('', 10000, '31.10.2026', 2000)).toBe('Rückerstattung CHF 100.00 pro rata, Austritt 31.10.2026');
    expect(appendInvoiceNote('old', 10000, '31.10.2026', 2000)).toBe('old\nRückerstattung CHF 100.00 pro rata, Austritt 31.10.2026');
    expect(appendInvoiceNote('x'.repeat(1990), 10000, '31.10.2026', 2000).length).toBe(2000);
  });

  it('postalAddressText formats lines pain.001 can parse', () => {
    expect(postalAddressText({ streetName: 'Seestrasse', streetNumber: '1', zipCode: '8000', city: 'Zürich', countryCode: 'CH' }))
      .toBe('Seestrasse 1\n8000 Zürich\nCH');
    expect(postalAddressText(undefined)).toBe('');
  });
});

describe('isLiveRefund', () => {
  it('counts every payment except a rejected or archived one', () => {
    expect(isLiveRefund({ status: 'draft' })).toBe(true);
    expect(isLiveRefund({ status: 'accepted' })).toBe(true);
    expect(isLiveRefund({ status: 'rejected' })).toBe(false);
    expect(isLiveRefund({ status: 'draft', isArchived: true })).toBe(false);
  });
});

describe('replacementPositions', () => {
  const positions = [
    { okey: 'p1', name: 'Jahresbeitrag', invoicePositionUsage: 'JB', year: 2026, amount: 120, sortOrder: 0, description: '' },
    { okey: 'p2', name: 'Bootsplatz', invoicePositionUsage: 'BP', year: 2026, amount: 50, sortOrder: 1, description: 'x' },
    { okey: 'p3', name: 'Jahresbeitrag Teil 2', invoicePositionUsage: 'JB', year: 2026, amount: 0, sortOrder: 2 },
    { okey: 'p4', name: 'Jahresbeitrag 2025', invoicePositionUsage: 'JB', year: 2025, amount: 120, sortOrder: 3 },
  ];

  it('replaces the matched fee positions by one pro-rata position and keeps the rest', () => {
    const out = replacementPositions(positions, 'JB', 2026, 100, 10, 120);
    expect(out.map(p => p['okey'])).toEqual(['p1', 'p2', 'p4']);
    expect(out[0]).toMatchObject({ amount: 100, description: 'pro rata verrechnet für 10 von 12 Monaten (voller Jahresbetrag CHF 120.00)', invoicePositionUsage: 'JB' });
    expect(out[1]).toEqual(positions[1]);
    expect(out[2]).toEqual(positions[3]);
  });

  it('orders by sortOrder', () => {
    const out = replacementPositions([positions[1], positions[0]], 'JB', 2026, 100, 10, 120);
    expect(out.map(p => p['okey'])).toEqual(['p1', 'p2']);
  });

  it('leaves the list unchanged when nothing matches', () => {
    expect(replacementPositions([positions[1]], 'JB', 2026, 100, 10, 120)).toEqual([positions[1]]);
  });
});

describe('resumableCancelled', () => {
  const reason = 'Austritt per 31.10.2026, pro rata';
  it('finds an invoice this settlement cancelled without a replacement yet', () => {
    const docs = [
      { okey: 'a', data: { state: 'cancelled', accountingTenantId: 'scs', tenants: ['scs'], notes: `x\n[Storniert 18.10.2026] ${reason}` } },
      { okey: 'b', data: { state: 'cancelled', accountingTenantId: 'scs', tenants: ['scs'], notes: '[Storniert 18.10.2026] Fehler' } },
      { okey: 'c', data: { state: 'paid', accountingTenantId: 'scs', tenants: ['scs'], notes: reason } },
      { okey: 'd', data: { state: 'cancelled', accountingTenantId: 'gss', tenants: ['scs'], notes: `] ${reason}` } },
      { okey: 'e', data: { state: 'cancelled', accountingTenantId: 'scs', tenants: ['other'], notes: `] ${reason}` } },
    ];
    expect(resumableCancelled(docs, 'scs', 'scs', reason)).toEqual(['a']);
  });
});
