/**
 * The settlement task lives at the deterministic id `exit-<membershipKey>` and is written in one
 * transaction (spec 1.105, final review I3); an archived membership is not settled (I1). Runs the real
 * Firestore paths against a small in-memory fake.
 */
import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { computeExitSettlement, noExitSettlement, type ExitSettlement } from '@okr/relationship-membership-util';

import { CLOSE_NOTE, ExitContext, isAutoClosed, loadExitContext, readSettlementTask, settlementTaskId } from './exit-settlement.context';
import { NOTES_MARKER, openOrUpdateSettlementTask, settlementTaskDecision } from './exit-settlement.trigger';
import { claimPatch } from './settle-membership-exit.logic';

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
  tenantId: 'scs', membershipKey: 'm1', memberLabel: 'Silvan Kamber',
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
const TASK_ID = 'exit-m1';

describe('settlementTaskId', () => {
  it('is deterministic per membership', () => expect(settlementTaskId('m1')).toBe(TASK_ID));
});

describe('settlementTaskDecision (shared by the trigger and the backfill dry run)', () => {
  const open = { tenants: ['scs'], state: 'initial', completionDate: '', notes: '' };
  it('missing -> create, open -> update, nothing due + open -> close', () => {
    expect(settlementTaskDecision(due(), undefined, 'scs')).toBe('create');
    expect(settlementTaskDecision(due(), open, 'scs')).toBe('update');
    expect(settlementTaskDecision(noExitSettlement(2026), open, 'scs')).toBe('close');
    expect(settlementTaskDecision(noExitSettlement(2026), undefined, 'scs')).toBe('noop');
  });
  it('claimed, treasurer-done, archived and foreign tasks are left alone', () => {
    expect(settlementTaskDecision(due(), { ...open, ...claimPatch('inv1') }, 'scs')).toBe('noop');
    expect(settlementTaskDecision(noExitSettlement(2026), { ...open, ...claimPatch('inv1') }, 'scs')).toBe('noop');
    expect(settlementTaskDecision(due(), { ...open, state: 'done', completionDate: '20261001', notes: 'Entschieden von X' }, 'scs')).toBe('noop');
    expect(settlementTaskDecision(due(), { ...open, isArchived: true }, 'scs')).toBe('noop');
    expect(settlementTaskDecision(due(), { ...open, tenants: ['evil'] }, 'scs')).toBe('noop');
  });
  it('an auto-closed task is reopened when something is due again, else left closed', () => {
    const closed = { ...open, state: 'done', completionDate: '20261001', notes: `x\n${CLOSE_NOTE}` };
    expect(settlementTaskDecision(due(), closed, 'scs')).toBe('reopen');
    expect(settlementTaskDecision(noExitSettlement(2026), closed, 'scs')).toBe('noop');
  });
});

describe('openOrUpdateSettlementTask', () => {
  it('creates the task at exit-<membershipKey>', async () => {
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
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: { tenants: ['scs'], state: 'initial', completionDate: '', name: 'old', notes: `old\n${NOTES_MARKER}\nangerufen` } } });
    expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('update');
    expect(String(store['tasks'][TASK_ID]['notes'])).toMatch(/Austrittsdatum: 31\.10\.2026[\s\S]*--- Notizen ---\nangerufen$/);
    expect(store['tasks'][TASK_ID]['name']).toContain('Rückerstattung');
  });
  it('closes the open task when nothing is due any more', async () => {
    const { db, store } = fakeDb({ tasks: { [TASK_ID]: { tenants: ['scs'], state: 'initial', completionDate: '', notes: 'n' } } });
    expect(await openOrUpdateSettlementTask(db, ctx(), noExitSettlement(2026))).toBe('close');
    expect(store['tasks'][TASK_ID]).toMatchObject({ state: 'done', notes: `n\n${CLOSE_NOTE}` });
    expect(isAutoClosed(store['tasks'][TASK_ID])).toBe(true);
  });
  it('reopens an auto-closed task in place: open state, no completion date, fresh content, treasurer text kept', async () => {
    const closed = { tenants: ['scs'], state: 'done', completionDate: '20261001', name: 'old',
      notes: `old\n${NOTES_MARKER}\nangerufen\n${CLOSE_NOTE}`, tags: 'exit-settlement', relatedKey: 'membership.m1' };
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
    expect(Object.keys(store['tasks'])).toEqual([TASK_ID]);
  });
  it('leaves a claimed or treasurer-done task untouched', async () => {
    const claimed = { tenants: ['scs'], state: 'initial', completionDate: '', notes: 'c', ...claimPatch('inv1') };
    const done = { tenants: ['scs'], state: 'done', completionDate: '20261001', notes: 'Entschieden von X am 1.10.2026: Rückerstattung' };
    for (const t of [claimed, done]) {
      const { db, store } = fakeDb({ tasks: { [TASK_ID]: { ...t } } });
      expect(await openOrUpdateSettlementTask(db, ctx(), due())).toBe('noop');
      expect(store['tasks'][TASK_ID]).toEqual(t);
    }
  });
});

describe('readSettlementTask', () => {
  it('reads the task by its deterministic id', async () => {
    const { db } = fakeDb({ tasks: { [TASK_ID]: { notes: 'n' } } });
    expect(await readSettlementTask(db, 'm1')).toEqual({ notes: 'n' });
    expect(await readSettlementTask(db, 'm2')).toBeUndefined();
  });
});

describe('loadExitContext', () => {
  const base = (m: Doc): Store => ({
    memberships: { m1: m },
    'accounting-configs': { scs: { tenants: ['scs'], feeSchedule: [] } },
    orgs: { scs: { tenants: ['scs'] } },
  });
  it('loads a live membership', async () => {
    const { db } = fakeDb(base(membership()));
    expect((await loadExitContext(db, 'm1', '20261018'))?.tenantId).toBe('scs');
  });
  it('returns undefined for an archived membership (the callable refuses no-membership)', async () => {
    const { db } = fakeDb(base(membership({ isArchived: true })));
    expect(await loadExitContext(db, 'm1', '20261018')).toBeUndefined();
  });
  it('loads an archived membership only when asked to (the trigger closes its task)', async () => {
    const { db } = fakeDb(base(membership({ isArchived: true })));
    expect((await loadExitContext(db, 'm1', '20261018', { includeArchived: true }))?.membership.isArchived).toBe(true);
  });
});
