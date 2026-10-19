import { describe, expect, it } from 'vitest';
import type { ExitSettlement, SettlementCase } from '@okr/relationship-membership-util';

import { claimedInvoiceKey, claimPatch } from './settle-membership-exit.logic';
import {
  exitChanged, exitSettlementFor, isServerTask, isSettlementWriter, mergeTaskNotes, NOTES_MARKER, REOPEN_NOTE, reopenedTaskNotes, siblingsToSettle,
  taskStateOf, upsertDecision, writerCheck, writerTenant,
} from './exit-settlement.trigger';
import {
  CLOSE_NOTE, doneTaskDecision, flattenCategoryLists, isAutoClosed, needsPositions, overlappingCount, pickBooksId, toAvatarInfo,
  toInvoiceFacts,
} from './exit-settlement.context';
import { SYSTEM_AUTHOR } from '../workflow/activity';

const settlement = (c: SettlementCase): ExitSettlement => ({
  case: c, exitYear: 2026, months: 6, yearlyFr: 600, dueFr: 300, billedFr: 600, overpaidRappen: 30000,
  refundRappen: c === 'paid' ? 30000 : 0, choices: [], manualReason: c === 'manual' ? 'no-invoice' : '', accountKey: '',
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

  it('fires when the membership is archived (its task must close)', () => {
    expect(exitChanged({ dateOfExit: '20261031', isArchived: false }, { dateOfExit: '20261031', isArchived: true })).toBe(true);
    expect(exitChanged({ dateOfExit: '20261031' }, { dateOfExit: '20261031', isArchived: true })).toBe(true);
  });

  it('fires when the membership is restored from the archive', () => {
    expect(exitChanged({ dateOfExit: '20261031', isArchived: true }, { dateOfExit: '20261031', isArchived: false })).toBe(true);
  });

  it('ignores an archived membership whose exit and archive flag stay the same', () => {
    expect(exitChanged({ dateOfExit: '20261031', isArchived: true }, { dateOfExit: '20261031', isArchived: true, notes: 'x' })).toBe(false);
  });
});

describe('exitSettlementFor', () => {
  it('settles nothing for an archived membership, so the open task closes', () => {
    const s = settlement('paid');
    expect(exitSettlementFor({ isArchived: true }, () => s).case).toBe('none');
    expect(upsertDecision(exitSettlementFor({ isArchived: true }, () => s), 'open')).toBe('close');
  });
  it('computes the settlement of a live membership', () => {
    const s = settlement('paid');
    expect(exitSettlementFor({ isArchived: false }, () => s)).toBe(s);
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

  it.each([...due, 'none' as SettlementCase])('leaves a task claimed by an invoice adjustment alone when %s', (c) => {
    expect(upsertDecision(settlement(c), 'claimed')).toBe('noop');
  });

  it('detects the claim with the callable\'s helper', () => {
    expect(claimedInvoiceKey(claimPatch('i1'))).toBe('i1');
    expect(claimedInvoiceKey({ linkKey: '', linkModelType: '' })).toBe('');
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

  it.each(due)('reopens an auto-closed task when %s is due again', (c) => {
    expect(upsertDecision(settlement(c), 'auto-closed')).toBe('reopen');
  });

  it('leaves an auto-closed task closed when nothing is due', () => {
    expect(upsertDecision(settlement('none'), 'auto-closed')).toBe('noop');
  });

  it.each(due)('replaces a squatted doc at the task id with a fresh server task when %s is due', (c) => {
    expect(upsertDecision(settlement(c), 'squatted')).toBe('replace');
  });

  it('leaves a squatted doc alone while nothing is due (no task is needed)', () => {
    expect(upsertDecision(settlement('none'), 'squatted')).toBe('noop');
  });

  it.each([...due, 'none' as SettlementCase])('never overwrites a locked squat (done, completed or claimed) when %s', (c) => {
    expect(upsertDecision(settlement(c), 'squatted-locked')).toBe('noop');
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

  it('ignores trailing blank lines after the close note', () => {
    expect(isAutoClosed({ state: 'done', notes: `x\n${CLOSE_NOTE}\n\n  ` })).toBe(true);
  });

  it('is a decision when anything follows the close note (hand-reopened, then decided)', () => {
    // auto-closed, reopened by hand (notes untouched), then decided by the treasurer
    const notes = `figures\n${CLOSE_NOTE}\nEntschieden von Anna am 01.10.2026: Rückerstattung CHF 100.00`;
    expect(isAutoClosed({ state: 'done', notes })).toBe(false);
    expect(doneTaskDecision({ state: 'done', notes })).toBe('Entschieden von Anna am 01.10.2026: Rückerstattung CHF 100.00');
  });

  it('is never auto-closed while the task is open', () => {
    expect(isAutoClosed({ state: 'initial', notes: `x\n${CLOSE_NOTE}` })).toBe(false);
  });
});

describe('reopenedTaskNotes', () => {
  it('turns the close note into history, so a later decision never reads as auto-closed', () => {
    const notes = reopenedTaskNotes(`old\n${NOTES_MARKER}\nangerufen\n${CLOSE_NOTE}`, 'neu');
    expect(notes).toBe(`neu\n${NOTES_MARKER}\nangerufen\n${REOPEN_NOTE}`);
    expect(notes).not.toContain(CLOSE_NOTE);
  });
});

describe('doneTaskDecision', () => {
  it('shows the close note for an auto-closed task instead of an empty decision', () => {
    expect(doneTaskDecision({ state: 'done', notes: `figures\n${CLOSE_NOTE}` })).toBe(CLOSE_NOTE);
  });
  it('returns the stored decision line of a treasurer-decided task', () => {
    expect(doneTaskDecision({ state: 'done', notes: 'figures\nEntschieden von Anna am 01.10.2026: Rückerstattung CHF 100.00' }))
      .toBe('Entschieden von Anna am 01.10.2026: Rückerstattung CHF 100.00');
  });
});

describe('pickBooksId', () => {
  const cfg = (okey: string, data: Record<string, unknown>) => ({ okey, data });

  it('takes the one books config of the tenant owned by the membership org (ownerKey)', () => {
    expect(pickBooksId([cfg('scs', { tenants: ['scs'], ownerKey: 'org.scs' })], 'scs', 'scs')).toBe('scs');
  });

  it('finds books whose id differs from the org okey (gss owned by an org)', () => {
    const configs = [cfg('scs', { tenants: ['scs'], ownerKey: 'org.scs' }), cfg('gss', { tenants: ['scs'], ownerKey: 'org.mkdf7xin64es5q4rmhdj' })];
    expect(pickBooksId(configs, 'scs', 'mkdf7xin64es5q4rmhdj')).toBe('gss');
  });

  it('never takes the books from the org okey or the tenant alone', () => {
    expect(pickBooksId([cfg('scs', { tenants: ['scs'] })], 'scs', 'scs')).toBeUndefined();
    expect(pickBooksId([cfg('scs', { tenants: ['scs'], ownerKey: '' , orgId: 'scs' })], 'scs', 'scs')).toBeUndefined();
  });

  it('reads the legacy orgId only when ownerKey is absent', () => {
    expect(pickBooksId([cfg('scs', { tenants: ['scs'], orgId: 'scs' })], 'scs', 'scs')).toBe('scs');
  });

  it('ignores personal books, books of another tenant and archived configs', () => {
    expect(pickBooksId([cfg('bka', { tenants: ['scs'], ownerKey: 'person.kaiser' })], 'scs', 'kaiser')).toBeUndefined();
    expect(pickBooksId([cfg('scs', { tenants: ['evil'], ownerKey: 'org.scs' })], 'scs', 'scs')).toBeUndefined();
    expect(pickBooksId([cfg('scs', { tenants: ['scs'], ownerKey: 'org.scs', isArchived: true })], 'scs', 'scs')).toBeUndefined();
  });

  it('detects nothing when several books match', () => {
    const configs = [cfg('a', { tenants: ['scs'], ownerKey: 'org.scs' }), cfg('b', { tenants: ['scs'], ownerKey: 'org.scs' })];
    expect(pickBooksId(configs, 'scs', 'scs')).toBeUndefined();
  });

  it('detects nothing without an org', () => {
    expect(pickBooksId([cfg('scs', { tenants: ['scs'], ownerKey: 'org.' })], 'scs', '')).toBeUndefined();
  });
});

describe('needsPositions', () => {
  const facts = (invoiceNo: number, invoiceDate: string) =>
    toInvoiceFacts('i', { invoiceNo, bookingKey: invoiceNo ? 'b' : '', invoiceDate }, []);

  it('loads positions for a native invoice of the exit year or the year after', () => {
    expect(needsPositions(facts(1, '20260301'), 2026)).toBe(true);
    expect(needsPositions(facts(1, '20270115'), 2026)).toBe(true);
  });

  it('loads positions for a native invoice issued in December for the exit year', () => {
    expect(needsPositions(facts(1, '20251215'), 2026)).toBe(true);
  });

  it('skips older or later native invoices and every bexio invoice', () => {
    expect(needsPositions(facts(1, '20240301'), 2026)).toBe(false);
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
    ['service_account', 'u1', 'skip'],
    ['system', 'u1', 'skip'],
    ['api_key', 'u1', 'check-user'],
    ['unauthenticated', 'u1', 'check-user'],
    ['unknown', 'u1', 'check-user'],
    ['app_user', 'u1', 'check-user'],
    ['something-new', 'u1', 'check-user'],
    ['app_user', undefined, 'skip'],
    ['app_user', '', 'skip'],
  ])('%s / %s -> %s (no writer, no tenant: nothing to do)', (authType, authId, expected) => {
    expect(writerCheck(authType, authId)).toBe(expected);
  });
});

describe('writerTenant', () => {
  it('is the first tenant of the writer\'s user doc, like getCallerTenantId', () => {
    expect(writerTenant({ tenants: ['scs', 'kring'] })).toBe('scs');
  });
  it('is empty without a user doc or tenants', () => {
    expect(writerTenant(undefined)).toBe('');
    expect(writerTenant({ tenants: [] })).toBe('');
    expect(writerTenant({})).toBe('');
  });
});

describe('isServerTask / taskStateOf (squatting)', () => {
  const server = {
    tenants: ['scs'], state: 'initial', completionDate: '', notes: '', tags: 'exit-settlement',
    relatedKey: 'membership.m1', author: { ...SYSTEM_AUTHOR },
  };

  it('accepts the task the trigger wrote, also with extra tags', () => {
    expect(isServerTask(server, 'scs', 'm1')).toBe(true);
    expect(isServerTask({ ...server, tags: 'urgent, exit-settlement' }, 'scs', 'm1')).toBe(true);
  });

  it.each([
    ['another author', { author: { ...SYSTEM_AUTHOR, key: 'p9', name1: 'Mallory' } }],
    ['no author', { author: undefined }],
    ['no settlement tag', { tags: 'todo' }],
    ['another membership', { relatedKey: 'membership.m2' }],
    ['another tenant', { tenants: ['evil'] }],
    ['no tenants', { tenants: undefined }],
  ])('rejects a doc with %s', (_why, over) => {
    const doc = { ...server, ...over };
    expect(isServerTask(doc, 'scs', 'm1')).toBe(false);
    expect(taskStateOf(doc, 'scs', 'm1')).toBe('squatted');
  });

  it('a squatted doc that is done, completed or claimed is locked: never overwritten', () => {
    expect(taskStateOf({ ...server, tags: '', state: 'done', completionDate: '20261001' }, 'scs', 'm1')).toBe('squatted-locked');
    expect(taskStateOf({ ...server, tags: '', state: 'done' }, 'scs', 'm1')).toBe('squatted-locked');
    expect(taskStateOf({ ...server, tags: '', completionDate: '20261001' }, 'scs', 'm1')).toBe('squatted-locked');
    expect(taskStateOf({ ...server, tags: '', ...claimPatch('inv1') }, 'scs', 'm1')).toBe('squatted-locked');
  });

  it('an open, unclaimed squatted doc (also archived) is squatted', () => {
    expect(taskStateOf({ ...server, tags: '' }, 'scs', 'm1')).toBe('squatted');
    expect(taskStateOf({ ...server, tags: '', isArchived: true }, 'scs', 'm1')).toBe('squatted');
  });

  it('a server task keeps its usual states', () => {
    expect(taskStateOf(undefined, 'scs', 'm1')).toBe('missing');
    expect(taskStateOf(server, 'scs', 'm1')).toBe('open');
    expect(taskStateOf({ ...server, state: 'done', notes: `x\n${CLOSE_NOTE}` }, 'scs', 'm1')).toBe('auto-closed');
  });
});
