import { describe, expect, it } from 'vitest';

import { billedPositions, booksOfTenantRefusal, isPostableRow, memberFeeDraft, unbookablePositions } from './post-member-fees';
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

  it('keeps a pro-rata description on the billed position', () => {
    const fee = { positions: [position({ amount: 350, description: 'pro rata verrechnet, 7 Monate' })] };
    expect(billedPositions(fee)[0].description).toBe('pro rata verrechnet, 7 Monate');
  });

  it('turns a rebate negative, so the invoice total matches getFeeTotal', () => {
    const fee = { positions: [position({ amount: 600 }), position({ key: 'rebate', type: 'rebate', label: 'Ausbildungsrabatt', amount: 50 })] };
    const billed = billedPositions(fee);
    expect(billed.map(p => p.amount)).toEqual([600, -50]);
    const asInput = billed.map(p => ({ name: p.label, amount: p.amount, accountKey: p.accountKey }));
    expect(issueBlockers(asInput, 'recv')).toEqual([]);
  });
});

describe('isPostableRow (spec 1.108, D5/D11)', () => {
  const fee = (over: Record<string, unknown> = {}) => ({
    tenants: ['scs'], accountingTenantId: 'scs', isArchived: false, state: 'ready', ...over,
  });

  it('posts a ready row of the run\'s books', () => {
    expect(isPostableRow(fee(), 'scs', 'scs')).toBe(true);
    expect(isPostableRow(fee({ accountingTenantId: 'gss' }), 'scs', 'gss')).toBe(true);
  });

  it('never posts a gss row in an scs run, nor an scs row in a gss run', () => {
    expect(isPostableRow(fee({ accountingTenantId: 'gss' }), 'scs', 'scs')).toBe(false);
    expect(isPostableRow(fee(), 'scs', 'gss')).toBe(false);
  });

  it('never posts a row without books — it does not count as scs', () => {
    expect(isPostableRow(fee({ accountingTenantId: '' }), 'scs', 'scs')).toBe(false);
    expect(isPostableRow(fee({ accountingTenantId: undefined }), 'scs', 'scs')).toBe(false);
    expect(isPostableRow(fee({ accountingTenantId: '' }), 'scs', '')).toBe(false);
  });

  it.each([
    ['of another tenant', { tenants: ['evil'] }],
    ['archived', { isArchived: true }],
    ['not ready', { state: 'review' }],
    ['already invoiced', { state: 'invoiced' }],
  ])('never posts a row that is %s', (_why, over) => {
    expect(isPostableRow(fee(over), 'scs', 'scs')).toBe(false);
  });
});

describe('booksOfTenantRefusal (spec 1.108, D5)', () => {
  it('accepts live books that list the caller\'s tenant', () => {
    expect(booksOfTenantRefusal({ tenants: ['scs'], isArchived: false }, 'scs')).toBeUndefined();
    expect(booksOfTenantRefusal({ tenants: ['scs', 'kring'] }, 'scs')).toBeUndefined();
  });
  it('refuses books that do not exist', () => {
    expect(booksOfTenantRefusal(undefined, 'scs')).toBe('not-found');
  });
  it('refuses books of another tenant', () => {
    expect(booksOfTenantRefusal({ tenants: ['gvs'], isArchived: false }, 'scs')).toBe('foreign-tenant');
    expect(booksOfTenantRefusal({ isArchived: false }, 'scs')).toBe('foreign-tenant');
  });
  it('refuses archived books', () => {
    expect(booksOfTenantRefusal({ tenants: ['scs'], isArchived: true }, 'scs')).toBe('archived');
  });
});
