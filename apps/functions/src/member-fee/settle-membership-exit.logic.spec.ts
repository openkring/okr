import { describe, expect, it } from 'vitest';
import type { ExitSettlement, SettlementCase, SettlementChoice } from '@okr/relationship-membership-util';

import {
  appendInvoiceNote, appendTaskNote, choiceRefusal, claimedChoices, claimedInvoiceKey, claimPatch, claimRefusal, decisionNote,
  emptySettlement, extendedRelLog, isLiveRefund, isValidClaim, membershipKeyOf, NO_IBAN_NOTE, postalAddressText, refundDecision, refundMessageId,
  refundInvoiceRefusal, refundOrderId, refundPaymentId, refundReference, replacementPositions, storedDecision, stornoReason, withInvoice,
} from './settle-membership-exit.logic';

const settlement = (c: SettlementCase, choices: SettlementChoice[], extra: Partial<ExitSettlement> = {}): ExitSettlement => ({
  case: c, exitYear: 2026, months: 10, yearlyFr: 120, dueFr: 100, billedFr: 120, overpaidRappen: 2000,
  refundRappen: c === 'paid' ? 10000 : 0, choices, manualReason: c === 'manual' ? 'no-invoice' : '', accountKey: '', shape: 'native',
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
    const long = appendInvoiceNote('x'.repeat(1990), 10000, '31.10.2026', 2000);
    expect(long.length).toBe(2000);
    expect(long.endsWith('\nRückerstattung CHF 100.00 pro rata, Austritt 31.10.2026')).toBe(true);
    expect(long.startsWith('xxx')).toBe(true);
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
    expect(out[2]).toEqual({ ...positions[3], sortOrder: 2 });
  });

  it('orders by sortOrder', () => {
    const out = replacementPositions([positions[1], positions[0]], 'JB', 2026, 100, 10, 120);
    expect(out.map(p => p['okey'])).toEqual(['p1', 'p2']);
  });

  it('leaves the list unchanged when nothing matches', () => {
    expect(replacementPositions([positions[1]], 'JB', 2026, 100, 10, 120)).toEqual([{ ...positions[1], sortOrder: 0 }]);
  });
});

describe('claim (adjust-invoice in progress)', () => {
  it('detects a claimed task from its invoice link', () => {
    expect(claimedInvoiceKey({ linkModelType: 'invoice', linkKey: 'invoice.i1' })).toBe('i1');
    expect(claimedInvoiceKey({ linkModelType: '', linkKey: '' })).toBe('');
    expect(claimedInvoiceKey({})).toBe('');
    expect(claimedInvoiceKey({ linkModelType: 'trip', linkKey: 'trip.t1' })).toBe('');
    expect(claimedInvoiceKey({ linkModelType: 'invoice', linkKey: 'invoice.' })).toBe('');
  });

  it('claimPatch writes the link the detection reads back', () => {
    expect(claimPatch('i1')).toEqual({ linkKey: 'invoice.i1', linkModelType: 'invoice' });
    expect(claimedInvoiceKey(claimPatch('i1'))).toBe('i1');
  });

  it('refuses every other choice while an adjustment is in progress', () => {
    expect(claimRefusal('i1', 'refund')).toBe('adjust-in-progress');
    expect(claimRefusal('i1', 'extend')).toBe('adjust-in-progress');
    expect(claimRefusal('i1', 'adjust-invoice')).toBeUndefined();
    expect(claimRefusal('', 'refund')).toBeUndefined();
  });

  it('a claimed task only offers finishing the adjustment', () => {
    const s = claimedChoices(settlement('manual', ['extend']));
    expect(s.choices).toEqual(['adjust-invoice']);
    expect(choiceRefusal(s, 'adjust-invoice', false, false)).toBeUndefined();
  });

  it('withInvoice adds the claimed (cancelled) invoice once', () => {
    const a = { okey: 'a' } as NonNullable<ExitSettlement['invoice']>;
    const b = { okey: 'b' } as NonNullable<ExitSettlement['invoice']>;
    expect(withInvoice([a], b).map(i => i.okey)).toEqual(['a', 'b']);
    expect(withInvoice([a, b], { ...b, title: 'x' }).map(i => i.okey)).toEqual(['a', 'b']);
  });
});

describe('refundDecision (member without IBAN)', () => {
  it('adds the missing-IBAN hint only when the payment needs review', () => {
    expect(refundDecision('Entschieden von A am 1.1.2026: Rückerstattung CHF 100.00', true))
      .toBe(`Entschieden von A am 1.1.2026: Rückerstattung CHF 100.00${NO_IBAN_NOTE}`);
    expect(NO_IBAN_NOTE).toContain('keine IBAN');
    expect(refundDecision('note', false)).toBe('note');
  });
});

describe('replacementPositions discounts', () => {
  it('recomputes a percent discount from the reduced fee and keeps a fixed one', () => {
    const out = replacementPositions([
      { okey: 'p1', name: 'Jahresbeitrag', invoicePositionType: 'fix', invoicePositionUsage: 'JB', year: 2026, amount: 120, sortOrder: 0 },
      { okey: 'p2', name: 'Rabatt', invoicePositionType: 'rebate', amount: -12, discountPercent: 10, sortOrder: 1 },
      { okey: 'p3', name: 'Gutschrift', invoicePositionType: 'rebate', amount: -5, discountPercent: 0, sortOrder: 2 },
    ], 'JB', 2026, 100, 10, 120);
    expect(out.map(p => p['amount'])).toEqual([100, -10, -5]);
    expect(out.map(p => p['sortOrder'])).toEqual([0, 1, 2]);
  });
});

describe('emptySettlement', () => {
  it('has no choices and no figures', () => {
    expect(emptySettlement()).toMatchObject({ case: 'none', choices: [], refundRappen: 0 });
  });
});

describe('isValidClaim (linkKey is client-writable, so a claim is checked)', () => {
  const facts = (over: Partial<NonNullable<ExitSettlement['invoice']>> = {}): NonNullable<ExitSettlement['invoice']> => ({
    okey: 'i1', invoiceId: '2026-17', accountingTenantId: 'scs', state: 'pending', invoiceNo: 17, bookingKey: 'invoice-i1',
    invoiceDate: '20260301', title: 'Jahresbeitrag', totalRappen: 12000, paidRappen: 0,
    positions: [{ usage: 'JB', year: 2026, amount: 120 }], ...over,
  });
  const claim = (over: Partial<Parameters<typeof isValidClaim>[0]> = {}): Parameters<typeof isValidClaim>[0] => ({
    facts: facts(), receiverKey: 'p1', tenants: ['scs'], isArchived: false, replaced: false, ...over,
  });
  const expected = { memberKey: 'p1', tenantId: 'scs', books: 'scs', usage: 'JB', exitYear: 2026 };

  it('accepts this settlement\'s pending or cancelled native fee invoice', () => {
    expect(isValidClaim(claim(), expected)).toBe(true);
    expect(isValidClaim(claim({ facts: facts({ state: 'cancelled' }) }), expected)).toBe(true);
  });

  it('refuses another member\'s invoice', () => {
    expect(isValidClaim(claim({ receiverKey: 'p2' }), expected)).toBe(false);
    expect(isValidClaim(claim({ receiverKey: '' }), { ...expected, memberKey: '' })).toBe(false);
  });

  it('refuses another tenant, other books or an archived invoice', () => {
    expect(isValidClaim(claim({ tenants: ['other'] }), expected)).toBe(false);
    expect(isValidClaim(claim({ facts: facts({ accountingTenantId: 'gss' }) }), expected)).toBe(false);
    expect(isValidClaim(claim({ isArchived: true }), expected)).toBe(false);
  });

  it('refuses a bexio invoice', () => {
    expect(isValidClaim(claim({ facts: facts({ invoiceNo: 0, bookingKey: '' }) }), expected)).toBe(false);
  });

  it('refuses an invoice that did not bill the fee of the exit year', () => {
    expect(isValidClaim(claim({ facts: facts({ positions: [{ usage: 'BP', year: 2026, amount: 50 }] }) }), expected)).toBe(false);
    expect(isValidClaim(claim({ facts: facts({ positions: [{ usage: 'JB', year: 2025, amount: 120 }] }) }), expected)).toBe(false);
  });

  it('refuses a paid or draft invoice and one that already has a replacement', () => {
    expect(isValidClaim(claim({ facts: facts({ state: 'paid' }) }), expected)).toBe(false);
    expect(isValidClaim(claim({ facts: facts({ state: 'draft' }) }), expected)).toBe(false);
    expect(isValidClaim(claim({ replaced: true }), expected)).toBe(false);
  });
});

describe('refundInvoiceRefusal', () => {
  const inv = (over: Record<string, unknown> = {}) => ({ tenants: ['scs'], accountingTenantId: 'scs', state: 'paid', ...over });
  it('accepts the invoice of the tenant and the books', () => {
    expect(refundInvoiceRefusal(inv(), 'scs', 'scs')).toBeUndefined();
  });
  it('refuses a cancelled invoice re-read in the transaction', () => {
    expect(refundInvoiceRefusal(inv({ state: 'cancelled' }), 'scs', 'scs')).toBe('state-changed');
  });
  it('refuses a missing invoice, another tenant or other books', () => {
    expect(refundInvoiceRefusal(undefined, 'scs', 'scs')).toBe('state-changed');
    expect(refundInvoiceRefusal(inv({ tenants: ['gss'] }), 'scs', 'scs')).toBe('state-changed');
    expect(refundInvoiceRefusal(inv({ accountingTenantId: 'gss' }), 'scs', 'scs')).toBe('state-changed');
  });
});
