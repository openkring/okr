import { describe, expect, it } from 'vitest';
import type { ExitSettlement, SettlementCase } from '@okr/relationship-membership-util';

import { exitChanged, isSettlementWriter, mergeTaskNotes, NOTES_MARKER, siblingsToSettle, upsertDecision, writerCheck } from './exit-settlement.trigger';
import {
  CLOSE_NOTE, flattenCategoryLists, isAutoClosed, needsPositions, overlappingCount, resolveSettlementTenant, toAvatarInfo, toInvoiceFacts,
} from './exit-settlement.context';

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

describe('resolveSettlementTenant', () => {
  it('takes the membership tenant the books and the org also belong to', () => {
    expect(resolveSettlementTenant(['scs'], ['scs'], ['scs', 'kring'])).toBe('scs');
  });

  it('ignores a foreign tenant smuggled into the membership', () => {
    expect(resolveSettlementTenant(['evil', 'scs'], ['scs'], ['scs'])).toBe('scs');
  });

  it('skips when no tenant is shared by all three', () => {
    expect(resolveSettlementTenant(['evil', 'scs'], ['gss'], ['scs'])).toBeUndefined();
    expect(resolveSettlementTenant(['evil'], ['scs'], ['scs'])).toBeUndefined();
    expect(resolveSettlementTenant([], [], [])).toBeUndefined();
  });
});

describe('needsPositions', () => {
  const facts = (invoiceNo: number, invoiceDate: string) =>
    toInvoiceFacts('i', { invoiceNo, bookingKey: invoiceNo ? 'b' : '', invoiceDate }, []);

  it('loads positions for a native invoice of the exit year or the year after', () => {
    expect(needsPositions(facts(1, '20260301'), 2026)).toBe(true);
    expect(needsPositions(facts(1, '20270115'), 2026)).toBe(true);
  });

  it('skips older or later native invoices and every bexio invoice', () => {
    expect(needsPositions(facts(1, '20250301'), 2026)).toBe(false);
    expect(needsPositions(facts(1, '20280301'), 2026)).toBe(false);
    expect(needsPositions(facts(0, '20260301'), 2026)).toBe(false);
  });
});

describe('siblingsToSettle', () => {
  const created = { okey: 'new', memberKey: 'p1', orgKey: 'scs' };
  const sib = (okey: string, dateOfExit: string, extra: Record<string, unknown> = {}) =>
    ({ okey, memberKey: 'p1', orgKey: 'scs', dateOfExit, isArchived: false, ...extra });

  it('returns the ended memberships of the same member and org in this or last year', () => {
    expect(siblingsToSettle(created, [
      sib('new', ''),                        // the created one itself
      sib('j2026', '20260331'),              // category change this year
      sib('j2025', '20250630'),              // last year
      sib('old', '20240331'),                // too old
      sib('full', '20261231'),               // a full year, nothing to settle
      sib('open', '99991231'),               // no exit
      sib('none', ''),                       // no exit
      sib('gss', '20260331', { orgKey: 'gss' }),
      sib('other', '20260331', { memberKey: 'p2' }),
      sib('arch', '20260331', { isArchived: true }),
    ], '20261018')).toEqual(['j2026', 'j2025']);
  });
});

describe('mergeTaskNotes', () => {
  it('puts the generated block above the marker on create', () => {
    expect(mergeTaskNotes(undefined, 'A\nB')).toBe(`A\nB\n${NOTES_MARKER}\n`);
  });

  it('replaces only the generated block and keeps the treasurer notes below the marker', () => {
    const existing = `old figures\n${NOTES_MARKER}\nMitglied angerufen, ist einverstanden.`;
    expect(mergeTaskNotes(existing, 'new figures')).toBe(`new figures\n${NOTES_MARKER}\nMitglied angerufen, ist einverstanden.`);
  });

  it('keeps everything of an unmarked note below the marker, nothing is lost', () => {
    expect(mergeTaskNotes('handwritten', 'new')).toBe(`new\n${NOTES_MARKER}\nhandwritten`);
  });
});

describe('isSettlementWriter', () => {
  const user = (roles: Record<string, boolean>, tenants = ['scs']) => ({ tenants, roles });

  it('accepts a member admin, privileged, treasurer or admin of the tenant', () => {
    for (const r of ['memberAdmin', 'privileged', 'treasurer', 'admin']) expect(isSettlementWriter(user({ [r]: true }), 'scs')).toBe(true);
  });

  it('rejects a plain member, a user of another tenant and a missing user', () => {
    expect(isSettlementWriter(user({ registered: true }), 'scs')).toBe(false);
    expect(isSettlementWriter(user({ admin: true }, ['evil']), 'scs')).toBe(false);
    expect(isSettlementWriter(undefined, 'scs')).toBe(false);
  });
});

describe('writerCheck', () => {
  it.each([
    ['service_account', 'allow'],
    ['system', 'allow'],
    ['api_key', 'check-user'],
    ['unauthenticated', 'check-user'],
    ['unknown', 'check-user'],
    ['app_user', 'check-user'],
    ['something-new', 'check-user'],
  ])('%s -> %s (fail closed)', (authType, expected) => {
    expect(writerCheck(authType)).toBe(expected);
  });
});
