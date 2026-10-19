/**
 * The settlement task lives at the deterministic id `exit-<tenantId>-<membershipKey>` and is written in one
 * transaction (spec 1.105, final review I3); an archived membership is not settled (I1). Runs the real
 * Firestore paths against a small in-memory fake.
 */
import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { computeExitSettlement, noExitSettlement, type ExitSettlement } from '@okr/relationship-membership-util';

import { CLOSE_NOTE, ExitContext, isAutoClosed, isExitContext, loadExitContext, settlementTaskId } from './exit-settlement.context';
import { NOTES_MARKER, openOrUpdateSettlementTask, REOPEN_NOTE, settlementTaskDecision } from './exit-settlement.trigger';
import { claimPatch } from './settle-membership-exit.logic';
import { rebuildFeeRow } from './exit-settlement.fee-row';
import { SYSTEM_AUTHOR } from '../workflow/activity';

type Doc = Record<string, unknown>;
type Store = Record<string, Record<string, Doc>>;

/** Just enough of Firestore for the exit settlement: doc get, equality / array-contains queries, transactions. */
function fakeDb(store: Store): { db: Firestore; store: Store } {
  const docRef = (col: string, id: string) => ({
    id, col,
    get: async () => snap(col, id),
  });
  const snap = (col: string, id: string) => {
    const d = store[col]?.[id];
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined), ref: docRef(col, id) };
  };
  const field = (d: Doc, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Doc | undefined)?.[k], d);
  const collection = (col: string) => ({
    doc: (id: string) => docRef(col, id),
    where: (path: string, op: string, value: unknown) => ({
      get: async () => ({
        docs: Object.keys(store[col] ?? {})
          .filter(id => {
            const v = field(store[col][id], path);
            return op === 'array-contains' ? Array.isArray(v) && v.includes(value) : v === value;
          })
          .map(id => snap(col, id)),
      }),
    }),
  });
  const put = (ref: { col: string; id: string }, d: Doc) => { store[ref.col] = { ...(store[ref.col] ?? {}), [ref.id]: d }; };
  const db = {
    collection,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({
      get: async (ref: { col: string; id: string }) => snap(ref.col, ref.id),
      create: (ref: { col: string; id: string }, d: Doc) => {
        if (store[ref.col]?.[ref.id]) throw new Error('already exists');
        put(ref, d);
      },
      update: (ref: { col: string; id: string }, d: Doc) => put(ref, { ...store[ref.col][ref.id], ...d }),
      set: (ref: { col: string; id: string }, d: Doc) => put(ref, d),
    }),
  };
  return { db: db as unknown as Firestore, store };
}

const membership = (over: Doc = {}): Doc => ({
  tenants: ['scs'], orgKey: 'scs', memberKey: 'p1', memberName1: 'Silvan', memberName2: 'Kamber',
  dateOfEntry: '20250205', dateOfExit: '20261031', category: 'active', isArchived: false, ...over,
});

const ctx = (): ExitContext => ({
  tenantId: 'scs', membershipKey: 'm1', memberLabel: 'Silvan Kamber', sameEntryMemberships: 1,
  membership: membership() as unknown as ExitContext['membership'],
  input: {
    membership: { dateOfEntry: '20250205', dateOfExit: '20261031', category: 'active', orgKey: 'scs' },
    overlappingMemberships: 1,
    schedule: { year: 2026, positions: [{ key: 'fee', usage: 'membershipFee', type: 'fee', label: 'Jahresbeitrag', source: 'category', proRata: true }] },
    categoryLists: { mcat: { active: 600 } }, defaultCategoryList: 'mcat', booksId: 'scs',
    invoices: [{ okey: 'inv1', invoiceId: 'REA-1', accountingTenantId: 'scs', state: 'paid', invoiceNo: 0, bookingKey: '',
      invoiceDate: '20260416', title: 'Jahresbeitrag 2026', totalRappen: 60000, paidRappen: 60000, positions: [] }],
    today: '20261018',
  },
});
const due = (): ExitSettlement => computeExitSettlement(ctx().input);
const TASK_ID = 'exit-scs-m1';
/** What makes a doc at the task id a task the trigger wrote (anything else is squatted). */
const SERVER = { tenants: ['scs'], tags: 'exit-settlement', relatedKey: 'membership.m1', author: { ...SYSTEM_AUTHOR } };

describe('settlementTaskId', () => {
  it('is deterministic per tenant and membership', () => expect(settlementTaskId('scs', 'm1')).toBe(TASK_ID));
  it('differs per tenant, so one tenant never writes over another tenant\'s task', () => {
    expect(settlementTaskId('gvs', 'm1')).not.toBe(settlementTaskId('scs', 'm1'));
  });
});

describe('settlementTaskDecision (shared by the trigger and the backfill dry run)', () => {
  const open = { ...SERVER, state: 'initial', completionDate: '', notes: '' };
  it('missing -> create, open -> update, nothing due + open -> close', () => {
    expect(settlementTaskDecision(due(), undefined, 'scs', 'm1')).toBe('create');
    expect(settlementTaskDecision(due(), open, 'scs', 'm1')).toBe('update');
    expect(settlementTaskDecision(noExitSettlement(2026), open, 'scs', 'm1')).toBe('close');
    expect(settlementTaskDecision(noExitSettlement(2026), undefined, 'scs', 'm1')).toBe('noop');
  });
  it('claimed, treasurer-done and archived tasks are left alone', () => {
    expect(settlementTaskDecision(due(), { ...open, ...claimPatch('inv1') }, 'scs', 'm1')).toBe('noop');
    expect(settlementTaskDecision(noExitSettlement(2026), { ...open, ...claimPatch('inv1') }, 'scs', 'm1')).toBe('noop');
    expect(settlementTaskDecision(due(), { ...open, state: 'done', completionDate: '20261001', notes: 'Entschieden von X' }, 'scs', 'm1')).toBe('noop');
    expect(settlementTaskDecision(due(), { ...open, isArchived: true }, 'scs', 'm1')).toBe('noop');
  });
  it('a squatted doc (foreign tenant, author, tag or membership) is replaced when something is due', () => {
    expect(settlementTaskDecision(due(), { ...open, tenants: ['evil'] }, 'scs', 'm1')).toBe('replace');
    expect(settlementTaskDecision(due(), { ...open, author: { ...SYSTEM_AUTHOR, key: 'p9' } }, 'scs', 'm1')).toBe('replace');
    expect(settlementTaskDecision(due(), open, 'scs', 'm2')).toBe('replace');
    expect(settlementTaskDecision(noExitSettlement(2026), { ...open, tenants: ['evil'] }, 'scs', 'm1')).toBe('noop');
  });
  it('an auto-closed task is reopened when something is due again, else left closed', () => {
    const closed = { ...open, state: 'done', completionDate: '20261001', notes: `x\n${CLOSE_NOTE}` };
    expect(settlementTaskDecision(due(), closed, 'scs', 'm1')).toBe('reopen');
    expect(settlementTaskDecision(noExitSettlement(2026), closed, 'scs', 'm1')).toBe('noop');
  });
});

describe('openOrUpdateSettlementTask', () => {
  it('creates the task at exit-<tenantId>-<membershipKey>', async () => {
    const { db, store } = fakeDb({});
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('create');
    const t = store['tasks'][TASK_ID];
    expect(t).toMatchObject({ tenants: ['scs'], tags: 'exit-settlement', relatedKey: 'membership.m1', state: 'initial' });
    expect(t['okey']).toBeUndefined();
    expect(Object.keys(store['tasks'])).toEqual([TASK_ID]);
  });
  it('two runs in a row give one task (create, then update)', async () => {
    const { db, store } = fakeDb({});
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('create');
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('update');
    expect(Object.keys(store['tasks'])).toEqual([TASK_ID]);
  });
  it('update keeps the treasurer text below the marker', async () => {
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: { ...SERVER, state: 'initial', completionDate: '', name: 'old', notes: `old\n${NOTES_MARKER}\nangerufen` } } });
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('update');
    expect(String(store['tasks'][TASK_ID]['notes'])).toMatch(/Austrittsdatum: 31\.10\.2026[\s\S]*--- Notizen ---\nangerufen$/);
    expect(store['tasks'][TASK_ID]['name']).toContain('Rückerstattung');
  });
  it('closes the open task when nothing is due any more', async () => {
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: { ...SERVER, state: 'initial', completionDate: '', notes: 'n' } } });
    expect(await openOrUpdateSettlementTask(db, ctx(), noExitSettlement(2026))).toBe('close');
    expect(store['tasks'][TASK_ID]).toMatchObject({ state: 'done', notes: `n\n${CLOSE_NOTE}` });
    expect(isAutoClosed(store['tasks'][TASK_ID])).toBe(true);
  });
  it('reopens an auto-closed task in place: open state, no completion date, fresh content, treasurer text kept', async () => {
    const closed = { ...SERVER, state: 'done', completionDate: '20261001', name: 'old',
      notes: `old\n${NOTES_MARKER}\nangerufen\n${CLOSE_NOTE}`, linkKey: 'invoice.old', linkModelType: 'invoice' };
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: closed } });
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('reopen');
    const t = store['tasks'][TASK_ID];
    expect(t).toMatchObject({ state: 'initial', completionDate: '' });
    expect(t['name']).toContain('Rückerstattung');
    expect(String(t['notes'])).toContain('angerufen');
    expect(String(t['notes'])).toContain('Austrittsdatum: 31.10.2026');
    // the reopened task must not read as auto-closed once the treasurer decides it
    expect(String(t['notes'])).not.toContain(CLOSE_NOTE);
    expect(isAutoClosed({ ...t, state: 'done' })).toBe(false);
    // a reopened task carries no stale claim
    expect(t).toMatchObject({ linkKey: '', linkModelType: '' });
    expect(Object.keys(store['tasks'])).toEqual([TASK_ID]);
  });
  it('update of a hand-reopened task turns the close note into history; deciding it later is a decision', async () => {
    // auto-closed, then reopened by hand: open again, the close note still in the notes
    const reopened = { ...SERVER, state: 'initial', completionDate: '', name: 'old', notes: `old\n${NOTES_MARKER}\nangerufen\n${CLOSE_NOTE}` };
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: reopened } });
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('update');
    const notes = String(store['tasks'][TASK_ID]['notes']);
    expect(notes).not.toContain(CLOSE_NOTE);
    expect(notes).toContain(REOPEN_NOTE);
    const decided = { ...store['tasks'][TASK_ID], state: 'done', notes: `${notes}\nEntschieden von Anna am 19.10.2026: Rückerstattung CHF 100.00` };
    expect(isAutoClosed(decided)).toBe(false);
    expect(settlementTaskDecision(due(), decided, 'scs', 'm1')).toBe('noop');
  });
  it('never overwrites a squatted doc that is done (a decision may be lost)', async () => {
    const squat = { tenants: ['scs'], state: 'done', completionDate: '20261001', notes: 'Entschieden von Mallory', tags: '', author: { key: 'p9' } };
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: { ...squat } } });
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('noop');
    expect(store['tasks'][TASK_ID]).toEqual(squat);
  });
  it('never overwrites a squatted doc with a completion date or a claim (a storno may be in progress)', async () => {
    const base = { tenants: ['scs'], state: 'initial', completionDate: '', notes: 'x', tags: '', author: { key: 'p9' } };
    for (const squat of [{ ...base, completionDate: '20261001' }, { ...base, ...claimPatch('inv1') }]) {
      const { db, store } = fakeDb({ tasks: { [TASK_ID]: { ...squat } } });
      expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('noop');
      expect(store['tasks'][TASK_ID]).toEqual(squat);
    }
  });
  it('replaces an open, unclaimed squatted doc with a fresh server task, keeping the text below the marker', async () => {
    const squat = { tenants: ['scs'], state: 'initial', completionDate: '', notes: `gefälscht\n${NOTES_MARKER}\nangerufen`, tags: '', author: { key: 'p9' } };
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: squat } });
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('replace');
    const t = store['tasks'][TASK_ID];
    expect(t).toMatchObject({ tenants: ['scs'], tags: 'exit-settlement', relatedKey: 'membership.m1', state: 'initial', author: SYSTEM_AUTHOR });
    // fresh generated block above the marker, the typed text below it survives
    expect(String(t['notes'])).toMatch(/^Austrittsdatum: 31\.10\.2026[\s\S]*\n--- Notizen ---\nangerufen$/);
    expect(String(t['notes'])).not.toContain('gefälscht');
  });
  it('replaces a doc of another tenant at the task id', async () => {
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: { ...SERVER, tenants: ['evil'], state: 'initial', notes: 'x' } } });
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('replace');
    expect(store['tasks'][TASK_ID]['tenants']).toEqual(['scs']);
  });
  it('leaves a claimed or treasurer-done task untouched', async () => {
    const claimed = { ...SERVER, state: 'initial', completionDate: '', notes: 'c', ...claimPatch('inv1') };
    const done = { ...SERVER, state: 'done', completionDate: '20261001', notes: 'Entschieden von X am 1.10.2026: Rückerstattung' };
    for (const t of [claimed, done]) {
      const { db, store } = fakeDb({ tasks: { [TASK_ID]: { ...t } } });
      expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('noop');
      expect(store['tasks'][TASK_ID]).toEqual(t);
    }
  });
});

describe('settlementTaskId', () => {
  it('is deterministic per tenant and membership', () => {
    expect(settlementTaskId('scs', 'm1')).toBe(TASK_ID);
    expect(settlementTaskId('scs', 'm2')).not.toBe(TASK_ID);
    expect(settlementTaskId('gvs', 'm1')).not.toBe(TASK_ID);
  });
});

describe('loadExitContext', () => {
  const base = (m: Doc, configs: Record<string, Doc> = { scs: { tenants: ['scs'], ownerKey: 'org.scs', feeSchedule: [] } }): Store => ({
    memberships: { m1: m },
    'accounting-configs': configs,
    orgs: { scs: { tenants: ['scs'] } },
  });
  const load = async (store: Store, opts: { includeArchived?: boolean } = {}) => loadExitContext(fakeDb(store).db, 'm1', 'scs', '20261018', opts);

  it('loads a live membership in the given tenant, with the books found via ownerKey', async () => {
    const r = await load(base(membership()));
    expect(isExitContext(r) && r.tenantId).toBe('scs');
    expect(isExitContext(r) && r.input.booksId).toBe('scs');
  });
  it('loads the fee schedule of the exit year from the books found via ownerKey', async () => {
    const fs = [{ year: 2026, positions: [] }, { year: 2025, positions: [] }];
    const r = await load(base(membership(), { scs: { tenants: ['scs'], ownerKey: 'org.scs', feeSchedule: fs } }));
    expect(isExitContext(r) && r.input.schedule).toEqual({ year: 2026, positions: [] });
  });
  it('finds books whose okey is neither the tenant nor the org (gss owned by org mkdf…)', async () => {
    const r = await load(base(membership({ orgKey: 'mkdf7xin64es5q4rmhdj' }), {
      scs: { tenants: ['scs'], ownerKey: 'org.scs' }, gss: { tenants: ['scs'], ownerKey: 'org.mkdf7xin64es5q4rmhdj' },
    }));
    expect(isExitContext(r) && r.input.booksId).toBe('gss');
  });
  it('never reads accounting-configs/{orgKey}: books without a matching owner are no books', async () => {
    expect(await load(base(membership(), { scs: { tenants: ['scs'], feeSchedule: [] } }))).toBe('no-books');
  });
  it('detects nothing when several books match', async () => {
    expect(await load(base(membership(), { a: { tenants: ['scs'], ownerKey: 'org.scs' }, b: { tenants: ['scs'], ownerKey: 'org.scs' } }))).toBe('no-books');
  });
  it('refuses a membership that does not belong to the tenant', async () => {
    expect(await load(base(membership({ tenants: ['gvs'] })))).toBe('foreign-tenant');
  });
  it('returns no-membership for a missing or archived membership (the callable refuses no-membership)', async () => {
    expect(await load(base(membership({ isArchived: true })))).toBe('no-membership');
    expect(await loadExitContext(fakeDb(base(membership())).db, 'm9', 'scs', '20261018')).toBe('no-membership');
  });
  it('loads an archived membership even without books, so its open task still closes', async () => {
    const r = await load(base(membership({ isArchived: true }), {}), { includeArchived: true });
    expect(isExitContext(r)).toBe(true);
    if (!isExitContext(r)) return;
    expect(r.input.booksId).toBe('');
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: { ...SERVER, state: 'initial', completionDate: '', notes: 'n' } } });
    expect(await openOrUpdateSettlementTask(db, r, noExitSettlement())).toBe('close');
    expect(store['tasks'][TASK_ID]['state']).toBe('done');
  });
  it('counts the live memberships of the member in the tenant with the same entry date and category', async () => {
    const store = base(membership());
    store['memberships']['m2'] = membership({ orgKey: 'other' });
    store['memberships']['m3'] = membership({ category: 'junior' });
    store['memberships']['m4'] = membership({ isArchived: true });
    store['memberships']['m5'] = membership({ tenants: ['gvs'] });
    const r = await load(store);
    expect(isExitContext(r) && r.sameEntryMemberships).toBe(2);
  });
  it('loads an archived membership only when asked to (the trigger closes its task)', async () => {
    const r = await load(base(membership({ isArchived: true })), { includeArchived: true });
    expect(isExitContext(r) && r.membership.isArchived).toBe(true);
  });
});

describe('rebuildFeeRow', () => {
  const schedule = { year: 2026, positions: [{ key: 'fee', usage: 'membershipFee', type: 'fee', label: 'Jahresbeitrag', source: 'category', proRata: true, accountKey: '3000' }] };
  const feeRow = (over: Doc = {}): Doc => ({
    tenants: ['scs'], member: { key: 'p1' }, state: 'initial', dateOfEntry: '20250205', category: 'active', isArchived: false,
    positions: [{ key: 'fee', amount: 600 }], ...over,
  });
  const withSchedule = (): ExitContext => ({ ...ctx(), input: { ...ctx().input, schedule: schedule as ExitContext['input']['schedule'] } });

  it('rewrites the one not-yet-invoiced row of the running year with the pro rata of the new exit', async () => {
    const { db, store } = fakeDb({ 'member-fees': { f1: feeRow() } });
    expect(await rebuildFeeRow(db, withSchedule(), '20261019')).toBe(true);
    expect((store['member-fees']['f1']['positions'] as { amount: number }[])[0].amount).toBe(500);
  });
  it('does nothing when several rows match', async () => {
    const { db, store } = fakeDb({ 'member-fees': { f1: feeRow(), f2: feeRow({ state: 'review' }) } });
    expect(await rebuildFeeRow(db, withSchedule(), '20261019')).toBe(false);
    expect((store['member-fees']['f1']['positions'] as { amount: number }[])[0].amount).toBe(600);
  });
  it('does nothing without a fee schedule for the year', async () => {
    const { db } = fakeDb({ 'member-fees': { f1: feeRow() } });
    expect(await rebuildFeeRow(db, { ...ctx(), input: { ...ctx().input, schedule: undefined } }, '20261019')).toBe(false);
  });
  it('skips when two live memberships in the tenant share entry date and category (two orgs)', async () => {
    const { db, store } = fakeDb({ 'member-fees': { f1: feeRow() } });
    expect(await rebuildFeeRow(db, { ...withSchedule(), sameEntryMemberships: 2 }, '20261019')).toBe(false);
    expect((store['member-fees']['f1']['positions'] as { amount: number }[])[0].amount).toBe(600);
  });
  it('leaves a row that moved on to an invoice meanwhile', async () => {
    const { db, store } = fakeDb({ 'member-fees': { f1: feeRow({ state: 'invoiced' }) } });
    expect(await rebuildFeeRow(db, withSchedule(), '20261019')).toBe(false);
    expect(store['member-fees']['f1']['state']).toBe('invoiced');
  });
});
