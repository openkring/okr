import { describe, expect, it } from 'vitest';

import { billedPositions, memberFeeDraft, unbookablePositions } from './post-member-fees';
import { issueBlockers, issueHeaderBlockers } from '../invoice/invoice.logic';
import type { MemberFeePosition } from '@okr/shared-models';

const position = (overrides: Partial<MemberFeePosition> = {}): MemberFeePosition => ({
  key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag',
  amount: 320, accountKey: 'acc1', vatCodeKey: 'v1', ...overrides,
});

describe('unbookablePositions', () => {
  it('passes a fee whose positions all carry a revenue account', () => {
    expect(unbookablePositions({ positions: [position(), position({ key: 'locker', accountKey: 'acc2' })] })).toEqual([]);
  });

  it('names every position without an accountKey — the shape the migration writes', () => {
    expect(unbookablePositions({ positions: [
      position(),
      position({ key: 'locker', label: 'Kästchen', accountKey: '' }),
      position({ key: 'bev', label: 'Getränke', accountKey: '   ' }),
    ] })).toEqual(['Kästchen', 'Getränke']);
  });

  it('falls back to the key when a position has no label', () => {
    expect(unbookablePositions({ positions: [position({ key: 'srv', label: '', accountKey: '' })] })).toEqual(['srv']);
  });

  it('treats a fee without positions as bookable (it simply produces an empty invoice)', () => {
    expect(unbookablePositions({ positions: [] })).toEqual([]);
  });
});

describe('memberFeeDraft', () => {
  const member = { key: 'p1', name1: 'Anna', name2: 'Muster', modelType: 'person', type: '', subType: '', label: 'Anna Muster' } as never;
  const o = { tenantId: 't1', accountingTenantId: 'acc', year: 2026, invoiceDate: '20261002', dueDate: '20261101' };
  const draft = () => memberFeeDraft({ member, positions: [position(), position({ key: 'l', amount: 50 })] }, o);

  it('is an unnumbered draft', () => {
    const d = draft();
    expect(d.state).toBe('draft');
    expect(d.invoiceNo).toBe(0);
    expect(d.invoiceId).toBe('');
    expect(d.bookingKey).toBe('');
    expect(d.payments).toEqual([]);
  });

  it('keeps title, dates, receiver and total', () => {
    const d = draft();
    expect(d.title).toBe('2026 Anna Muster');
    expect(d.invoiceDate).toBe('20261002');
    expect(d.dueDate).toBe('20261101');
    expect(d.receiver).toBe(member);
    expect(d.totalAmount).toEqual({ amount: 37000, currency: 'CHF', periodicity: 'one-time' });
    expect(d.tenants).toEqual(['t1']);
  });

  it('passes the header requirements of issueInvoice (template comes from the config)', () => {
    const d = draft();
    expect(issueHeaderBlockers({ receiverKey: d.receiver?.key, invoiceDate: d.invoiceDate, dueDate: d.dueDate, invoiceTemplateId: 'tpl' })).toEqual([]);
  });

  it('indexes without a number token', () => {
    expect(draft().index).not.toMatch(/i:/);
  });
});

describe('billedPositions', () => {
  it('leaves out zero amounts, so a 0 Eintrittsgebühr does not block issuing', () => {
    const fee = { positions: [position(), position({ key: 'E', label: 'Eintrittsgebühr', amount: 0, accountKey: '' })] };
    expect(billedPositions(fee).map(p => p.key)).toEqual(['jb']);
    expect(unbookablePositions(fee)).toEqual([]);
  });

  it('turns a rebate negative, so the invoice total matches getFeeTotal', () => {
    const fee = { positions: [position({ amount: 600 }), position({ key: 'rebate', type: 'rebate', label: 'Ausbildungsrabatt', amount: 50 })] };
    const billed = billedPositions(fee);
    expect(billed.map(p => p.amount)).toEqual([600, -50]);
    const asInput = billed.map(p => ({ name: p.label, amount: p.amount, accountKey: p.accountKey }));
    expect(issueBlockers(asInput, 'recv')).toEqual([]);
  });
});
