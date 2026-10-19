/**
 * §4.6 restored (spec 1.105, round 2): the trigger rewrites a not-yet-invoiced fee row of the running
 * year when the exit moves, behind the writer check. Pure decision helpers.
 */
import { describe, expect, it } from 'vitest';
import type { FeeScheduleEntry } from '@okr/shared-models';
import { noExitSettlement, type ExitSettlement } from '@okr/relationship-membership-util';

import { feeRowToRebuild, hasLockerToday, rebuiltFeePositions, settlementAfterRebuild } from './exit-settlement.fee-row';

const TODAY = '20261019';
const m = (over: Record<string, unknown> = {}) => ({
  memberKey: 'p1', dateOfEntry: '20250205', dateOfExit: '20261031', category: 'active', isArchived: false, ...over,
});
const row = (okey: string, over: Record<string, unknown> = {}) => ({
  okey,
  data: { tenants: ['scs'], accountingTenantId: 'scs', member: { key: 'p1' }, state: 'initial', dateOfEntry: '20250205', category: 'active', isArchived: false, ...over },
});

describe('feeRowToRebuild', () => {
  it('rebuilds the one matching row of the running year (initial or review)', () => {
    expect(feeRowToRebuild([row('f1')], m(), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'rebuild', rowKey: 'f1' });
    expect(feeRowToRebuild([row('f1', { state: 'review' })], m(), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'rebuild', rowKey: 'f1' });
  });

  it('rebuilds to the full year when the exit is cleared (either form of «no exit»)', () => {
    expect(feeRowToRebuild([row('f1')], m({ dateOfExit: '' }), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'rebuild', rowKey: 'f1' });
    expect(feeRowToRebuild([row('f1')], m({ dateOfExit: '99991231' }), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'rebuild', rowKey: 'f1' });
  });

  it('leaves the rows alone when the exit lies in another year', () => {
    expect(feeRowToRebuild([row('f1')], m({ dateOfExit: '20251031' }), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'skip', why: 'other-year' });
    expect(feeRowToRebuild([row('f1')], m({ dateOfExit: '20270331' }), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'skip', why: 'other-year' });
  });

  it('leaves the rows alone for an archived membership', () => {
    expect(feeRowToRebuild([row('f1')], m({ isArchived: true }), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'skip', why: 'archived' });
  });

  it.each([
    ['invoiced', { state: 'invoiced' }],
    ['another tenant', { tenants: ['evil'] }],
    ['another member', { member: { key: 'p2' } }],
    ['another entry date', { dateOfEntry: '20240101' }],
    ['another category', { category: 'junior' }],
    ['archived', { isArchived: true }],
    ['posted natively (invoiceKey)', { invoiceKey: 'inv1' }],
    ['uploaded to bexio (invoiceBexioId)', { invoiceBexioId: '42' }],
  ])('never touches a row that is %s', (_why, over) => {
    expect(feeRowToRebuild([row('f1', over)], m(), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'skip', why: 'no-row' });
  });

  it('skips when the member has two live memberships in the tenant with the same entry date and category (two orgs)', () => {
    expect(feeRowToRebuild([row('f1')], m(), { tenantId: 'scs', booksId: 'scs', today: TODAY, sameEntryMemberships: 2 })).toEqual({ action: 'skip', why: 'membership-collision' });
  });

  it('never touches a row of other books (spec 1.108, D6)', () => {
    expect(feeRowToRebuild([row('f1', { accountingTenantId: 'gss' })], m(), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'skip', why: 'other-books' });
  });

  it('ignores a row without books — never counts it as the club\'s (D11)', () => {
    expect(feeRowToRebuild([row('f1', { accountingTenantId: '' })], m(), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'skip', why: 'no-books' });
    expect(feeRowToRebuild([row('f1', { accountingTenantId: undefined })], m(), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'skip', why: 'no-books' });
  });

  it('rebuilds only the row of the membership org\'s books when the member has a row in both books', () => {
    const rows = [row('scs1'), row('gss1', { accountingTenantId: 'gss' })];
    expect(feeRowToRebuild(rows, m(), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'rebuild', rowKey: 'scs1' });
    expect(feeRowToRebuild(rows, m(), { tenantId: 'scs', booksId: 'gss', today: TODAY })).toEqual({ action: 'rebuild', rowKey: 'gss1' });
  });

  it('matches nothing without books', () => {
    expect(feeRowToRebuild([row('f1', { accountingTenantId: '' })], m(), { tenantId: 'scs', booksId: '', today: TODAY })).toEqual({ action: 'skip', why: 'no-books' });
  });

  it('keeps the collision guard even when the books match (D13)', () => {
    expect(feeRowToRebuild([row('f1')], m(), { tenantId: 'scs', booksId: 'scs', today: TODAY, sameEntryMemberships: 2 })).toEqual({ action: 'skip', why: 'membership-collision' });
  });

  it('does nothing when several rows match', () => {
    expect(feeRowToRebuild([row('f1'), row('f2', { state: 'review' })], m(), { tenantId: 'scs', booksId: 'scs', today: TODAY })).toEqual({ action: 'ambiguous', rowKeys: ['f1', 'f2'] });
  });
});

describe('hasLockerToday', () => {
  const locker = (over: Record<string, unknown> = {}) => ({
    ownerKey: 'p1', resourceType: 'locker', tenants: ['scs'], isArchived: false, validTo: '20271231', ...over,
  });

  it('is true for a live locker ownership of the member in the tenant (like the member-fee store)', () => {
    expect(hasLockerToday([locker()], 'p1', 'scs', TODAY)).toBe(true);
    expect(hasLockerToday([locker({ validTo: '99991231' })], 'p1', 'scs', TODAY)).toBe(true);
  });

  it.each([
    ['expired', { validTo: '20260101' }],
    ['not a locker', { resourceType: 'boat' }],
    ['archived', { isArchived: true }],
    ['another tenant', { tenants: ['evil'] }],
    ['another owner', { ownerKey: 'p2' }],
  ])('is false for an ownership that is %s', (_why, over) => {
    expect(hasLockerToday([locker(over)], 'p1', 'scs', TODAY)).toBe(false);
  });
});

describe('rebuiltFeePositions', () => {
  const schedule: FeeScheduleEntry = {
    year: 2026,
    positions: [
      { key: 'fee', usage: 'membershipFee', type: 'fee', label: 'Jahresbeitrag', source: 'category', proRata: true, accountKey: '3000' },
      { key: 'locker', usage: 'lockerRental', type: 'fee', label: 'Kasten', source: 'flag', flag: 'hasLocker', amount: 50, accountKey: '3010' },
    ],
  } as FeeScheduleEntry;
  const opts = { hasLocker: true, categoryLists: { mcat: { active: 600 } }, defaultCategoryList: 'mcat' };

  it('derives the pro rata from the new exit and keeps the locker flag', () => {
    const p = rebuiltFeePositions({ ...m(), memberBirthYear: '1990', rebate: 0, rebateReason: '' }, schedule, opts);
    expect(p.map(x => [x.key, x.amount])).toEqual([['fee', 500], ['locker', 50]]);
    expect(p[0].proRataMonths).toBe(10);
  });

  it('restores the full year when the exit is cleared', () => {
    const p = rebuiltFeePositions({ ...m({ dateOfExit: '' }), memberBirthYear: '1990', rebate: 0, rebateReason: '' }, schedule, opts);
    expect(p[0].amount).toBe(600);
    expect(p[0].proRataMonths).toBeUndefined();
  });

  it('adds the member rebate like the fee store', () => {
    const p = rebuiltFeePositions({ ...m(), memberBirthYear: '1990', rebate: 100, rebateReason: 'edu' }, schedule, opts);
    expect(p[p.length - 1]).toMatchObject({ type: 'rebate', amount: 100, accountKey: '3000' });
  });

  it('tolerates legacy docs with missing fields', () => {
    const p = rebuiltFeePositions({ memberKey: 'p1', dateOfEntry: '20250205', category: 'active' }, schedule, { ...opts, hasLocker: false });
    expect(p.map(x => x.amount)).toEqual([600, 0]);
  });
});

describe('settlementAfterRebuild', () => {
  const noInvoice: ExitSettlement = { ...noExitSettlement(2026), case: 'manual', manualReason: 'no-invoice', choices: ['extend'] };

  it('needs no task for a not-yet-invoiced exit once the row was rebuilt (§4.6)', () => {
    expect(settlementAfterRebuild(noInvoice, true)).toEqual(noExitSettlement(2026));
  });

  it('keeps the no-invoice task (with the «Neu laden» hint) when the row was not rebuilt', () => {
    expect(settlementAfterRebuild(noInvoice, false)).toBe(noInvoice);
  });

  it('never drops any other case', () => {
    const paid: ExitSettlement = { ...noExitSettlement(2026), case: 'paid', refundRappen: 100, choices: ['refund', 'extend'] };
    const ambiguous: ExitSettlement = { ...noInvoice, manualReason: 'ambiguous-invoice' };
    expect(settlementAfterRebuild(paid, true)).toBe(paid);
    expect(settlementAfterRebuild(ambiguous, true)).toBe(ambiguous);
  });
});
