import { describe, expect, it } from 'vitest';
import type { ExitSettlement, SettlementCase } from '@okr/relationship-membership-util';

import { exitChanged, upsertDecision } from './exit-settlement.trigger';
import { CLOSE_NOTE, flattenCategoryLists, isAutoClosed, overlappingCount, toAvatarInfo, toInvoiceFacts } from './exit-settlement.context';

const settlement = (c: SettlementCase): ExitSettlement => ({
  case: c, exitYear: 2026, months: 6, yearlyFr: 600, dueFr: 300, billedFr: 600, overpaidRappen: 30000,
  refundRappen: c === 'paid' ? 30000 : 0, choices: [], manualReason: c === 'manual' ? 'no-invoice' : '',
});

describe('exitChanged', () => {
  it('ignores an update that keeps the same exit', () => {
    expect(exitChanged({ dateOfExit: '20261031', category: 'A' }, { dateOfExit: '20261031', category: 'J' })).toBe(false);
  });

  it('fires when an exit is set', () => {
    expect(exitChanged({ dateOfExit: '99991231' }, { dateOfExit: '20261031' })).toBe(true);
  });

  it('fires when an exit is moved', () => {
    expect(exitChanged({ dateOfExit: '20261031' }, { dateOfExit: '20260930' })).toBe(true);
  });

  it('fires when an exit is cleared, to either form of «no exit»', () => {
    expect(exitChanged({ dateOfExit: '20261031' }, { dateOfExit: '99991231' })).toBe(true);
    expect(exitChanged({ dateOfExit: '20261031' }, { dateOfExit: '' })).toBe(true);
    expect(exitChanged({ dateOfExit: '20261031' }, {})).toBe(true);
  });

  it('treats the two forms of «no exit» as the same value', () => {
    expect(exitChanged({ dateOfExit: '' }, { dateOfExit: '99991231' })).toBe(false);
  });

  it('fires when a membership is created with an exit', () => {
    expect(exitChanged(undefined, { dateOfExit: '20261031' })).toBe(true);
  });

  it('ignores a membership created without an exit', () => {
    expect(exitChanged(undefined, { dateOfExit: '99991231' })).toBe(false);
  });

  it('ignores a deleted membership', () => {
    expect(exitChanged({ dateOfExit: '20261031' }, undefined)).toBe(false);
  });
});

describe('upsertDecision', () => {
  const due: SettlementCase[] = ['paid', 'unpaid', 'partial-enough', 'partial-short', 'manual'];

  it.each(due)('opens a task when %s is due and none exists', (c) => {
    expect(upsertDecision(settlement(c), 'missing')).toBe('create');
  });

  it.each(due)('updates the open task when %s is due (one task, never a second)', (c) => {
    expect(upsertDecision(settlement(c), 'open')).toBe('update');
  });

  it.each(due)('never reopens or duplicates a done task, even when %s is due', (c) => {
    expect(upsertDecision(settlement(c), 'done')).toBe('noop');
  });

  it('closes the open task when nothing is due any more', () => {
    expect(upsertDecision(settlement('none'), 'open')).toBe('close');
  });

  it('does nothing when nothing is due and there is no task', () => {
    expect(upsertDecision(settlement('none'), 'missing')).toBe('noop');
  });

  it('does nothing when nothing is due and the task is done', () => {
    expect(upsertDecision(settlement('none'), 'done')).toBe('noop');
  });
});

describe('flattenCategoryLists', () => {
  it('maps every list name to category -> price, missing prices as 0', () => {
    expect(flattenCategoryLists([
      { name: 'mcat', items: [{ name: 'A', price: 600 }, { name: 'J', price: 200 }, { name: 'E' }] },
      { name: 'empty' },
    ])).toEqual({ mcat: { A: 600, J: 200, E: 0 }, empty: {} });
  });
});

describe('overlappingCount', () => {
  const m = (orgKey: string, dateOfEntry: string, dateOfExit: string, isArchived = false) => ({ orgKey, dateOfEntry, dateOfExit, isArchived });

  it('counts the memberships of the same org that touch the exit year', () => {
    expect(overlappingCount([
      m('scs', '20200101', '20260331'),   // junior until March
      m('scs', '20260401', '20261031'),   // active from April, this one
      m('scs', '20100101', '20191231'),   // old history
      m('gss', '20200101', '99991231'),   // another org
      m('scs', '20270101', '99991231'),   // future
      m('scs', '20200101', '', true),     // archived
    ], 'scs', 2026)).toBe(2);
  });

  it('counts an open membership (empty exit) as overlapping', () => {
    expect(overlappingCount([m('scs', '20200101', '')], 'scs', 2026)).toBe(1);
  });
});

describe('toInvoiceFacts', () => {
  it('maps a native invoice, summing payments in Rappen and keeping only positions with a year', () => {
    expect(toInvoiceFacts('inv1', {
      invoiceId: 'REA-02001', accountingTenantId: 'scs', state: 'partial', invoiceNo: 2001, bookingKey: 'invoice-inv1',
      invoiceDate: '20260301', title: '2026 Hans Muster', totalAmount: { amount: 67500, currency: 'CHF' },
      payments: [{ amount: 20000 }, { amount: 5000 }],
    }, [
      { invoicePositionUsage: 'membershipFee', year: 2026, amount: 600 },
      { invoicePositionUsage: 'srv', year: 2026, amount: 75 },
    ])).toEqual({
      okey: 'inv1', invoiceId: 'REA-02001', accountingTenantId: 'scs', state: 'partial', invoiceNo: 2001,
      bookingKey: 'invoice-inv1', invoiceDate: '20260301', title: '2026 Hans Muster', totalRappen: 67500, paidRappen: 25000,
      positions: [{ usage: 'membershipFee', year: 2026, amount: 600 }, { usage: 'srv', year: 2026, amount: 75 }],
    });
  });

  it('maps a bexio-migrated invoice with missing fields to safe defaults', () => {
    expect(toInvoiceFacts('inv2', { invoiceId: '1911', title: 'Jahresbeitrag 2026' }, [])).toMatchObject({
      invoiceNo: 0, bookingKey: '', totalRappen: 0, paidRappen: 0, positions: [], state: '', accountingTenantId: '',
    });
  });
});

describe('toAvatarInfo', () => {
  it('maps the active responsible to a person avatar', () => {
    expect(toAvatarInfo({ key: 'p1', name1: 'Anna', name2: 'Kassier', modelType: 'person' })).toEqual({
      key: 'p1', name1: 'Anna', name2: 'Kassier', modelType: 'person', type: '', subType: '', label: 'Anna Kassier',
    });
  });

  it('returns undefined when nobody holds the responsibility', () => {
    expect(toAvatarInfo(undefined)).toBeUndefined();
    expect(toAvatarInfo({ key: '' })).toBeUndefined();
  });
});

describe('isAutoClosed', () => {
  it('recognises a task the trigger closed itself, so a later exit opens a fresh one', () => {
    expect(isAutoClosed({ state: 'done', notes: `Austrittsdatum: 31.10.2026\n${CLOSE_NOTE}` })).toBe(true);
  });

  it('keeps a task the treasurer completed as a decision', () => {
    expect(isAutoClosed({ state: 'done', notes: 'Austrittsdatum: 31.10.2026' })).toBe(false);
  });
});
