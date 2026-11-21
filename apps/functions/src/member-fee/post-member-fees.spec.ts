import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_o: unknown, h: unknown) => h,
  HttpsError: class HttpsError extends Error { constructor(public code: string, m: string) { super(m); } },
}));
vi.mock('firebase-admin/firestore', async (importOriginal) => ({ ...(await importOriginal<object>()), getFirestore: vi.fn() }));
vi.mock('@okr/shared-util-functions', () => ({
  checkAppCheckToken: vi.fn(), checkAuthentication: vi.fn(), checkRoles: vi.fn(), getCallerTenantId: vi.fn(async () => 'scs'),
}));
vi.mock('../email/mailing-letters', () => ({ postalOf: vi.fn() }));

import { getFirestore } from 'firebase-admin/firestore';
import { postalOf } from '../email/mailing-letters';
import { billedPositions, booksOfTenantRefusal, isPostableRow, memberFeeDraft, postMemberFees, unbookablePositions } from './post-member-fees';
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

// ---- callable: households (spec 1.168 §5) ------------------------------------------------------------

type Doc = Record<string, unknown>;
interface Write { op: 'set' | 'update'; path: string; data: Doc }

/** A tiny in-memory Firestore: `where` (== / array-contains), `count`, `doc().get()` and batches. */
function fakeDb(data: Record<string, Record<string, Doc>>) {
  const writes: Write[] = [];
  let commits = 0;
  const docRef = (col: string, id: string) => ({
    id, path: `${col}/${id}`,
    get: async () => ({ id, exists: data[col]?.[id] !== undefined, data: () => data[col]?.[id] }),
  });
  const query = (col: string, filters: [string, string, unknown][]) => {
    const docs = () => Object.entries(data[col] ?? {})
      .filter(([, d]) => filters.every(([f, op, v]) => op === 'array-contains'
        ? Array.isArray(d[f]) && (d[f] as unknown[]).includes(v) : d[f] === v))
      .map(([id, d]) => ({ id, ref: docRef(col, id), data: () => d }));
    return {
      where: (f: string, op: string, v: unknown) => query(col, [...filters, [f, op, v]]),
      get: async () => ({ docs: docs() }),
      count: () => ({ get: async () => ({ data: () => ({ count: docs().length }) }) }),
      doc: (id: string) => docRef(col, id),
    };
  };
  const db = {
    collection: (col: string) => query(col, []),
    batch: () => {
      const pending: Write[] = [];
      return {
        set: (ref: { path: string }, d: Doc) => { pending.push({ op: 'set', path: ref.path, data: d }); },
        update: (ref: { path: string }, d: Doc) => { pending.push({ op: 'update', path: ref.path, data: d }); },
        commit: async () => { writes.push(...pending); commits++; },
      };
    },
  };
  return { db, writes, commits: () => commits };
}

describe('postMemberFees — households (spec 1.168)', () => {
  const avatar = (key: string, name1: string) => ({ key, name1, name2: 'Muster', modelType: 'person', type: '', subType: '', label: `${name1} Muster` });
  const feeRow = (personKey: string, name1: string, amount: number) => ({
    tenants: ['scs'], accountingTenantId: 'scs', isArchived: false, state: 'ready', notes: '',
    member: avatar(personKey, name1), positions: [position({ amount })],
  });
  const seed = () => ({
    'accounting-configs': { scs: { tenants: ['scs'], isArchived: false, accountingBackend: 'native' } },
    'member-fees': {
      f1: feeRow('anna', 'Anna', 400), f2: feeRow('ben', 'Ben', 400), f3: feeRow('cleo', 'Cleo', 150),
      f4: feeRow('dora', 'Dora', 320),
    },
    households: {
      h1: { tenants: ['scs'], isArchived: false, name: 'Familie Muster', type: 'family', memberKeys: ['anna', 'ben', 'cleo'], payerKey: 'anna', contactKey: 'anna' },
    },
    categories: { c1: { name: 'household_type', tenants: ['scs'], items: [{ name: 'family', feeCap: 600 }] } },
    persons: { anna: { firstName: 'Anna', lastName: 'Muster' } },
  });
  const postal = { street: 'Seestrasse 4', zipCity: '8712 Stäfa', streetName: 'Seestrasse', streetNumber: '4', zipCode: '8712', city: 'Stäfa', countryCode: 'CH' };
  const call = () => (postMemberFees as unknown as (r: unknown) => Promise<Record<string, unknown>>)({ data: { accountingTenantId: 'scs' } });

  beforeEach(() => vi.mocked(postalOf).mockReset());

  it('posts one capped invoice for the household and gives every row the same invoiceKey', async () => {
    const fake = fakeDb(seed());
    vi.mocked(getFirestore).mockReturnValue(fake.db as never);
    vi.mocked(postalOf).mockResolvedValue(postal);

    const result = await call();

    const invoices = fake.writes.filter(w => w.op === 'set' && w.path.startsWith('invoices/'));
    expect(invoices).toHaveLength(2); // the household + Dora alone
    const household = invoices.find(w => (w.data['receiver'] as { key: string }).key === 'anna');
    expect(household?.data['totalAmount']).toMatchObject({ amount: 60000 });
    const key = household?.path.split('/')[1];
    const rowUpdates = fake.writes.filter(w => w.op === 'update' && ['member-fees/f1', 'member-fees/f2', 'member-fees/f3'].includes(w.path));
    expect(rowUpdates.map(w => w.data)).toEqual([
      { invoiceKey: key, state: 'invoiced' }, { invoiceKey: key, state: 'invoiced' }, { invoiceKey: key, state: 'invoiced' },
    ]);
    const positions = fake.writes.filter(w => w.path.startsWith('invoice-positions/') && w.data['invoiceKey'] === key);
    expect(positions.map(w => [w.data['personKey'], w.data['amount']])).toEqual([['anna', 400], ['ben', 400], ['cleo', 150], ['anna', -350]]);
    expect(positions[3].data['name']).toBe('Familienrabatt');
    expect(result).toMatchObject({ processed: 4, invoiced: 4, failed: [], review: 0 });
    expect(fake.commits()).toBe(2); // one batch per household, one per single
  });

  it('sets the household rows to review instead of posting them when the addresses differ', async () => {
    const fake = fakeDb(seed());
    vi.mocked(getFirestore).mockReturnValue(fake.db as never);
    vi.mocked(postalOf).mockImplementation(async (_db, parentKey) => parentKey === 'person.ben' ? { ...postal, zipCode: '8001' } : postal);

    const result = await call();

    const invoices = fake.writes.filter(w => w.op === 'set' && w.path.startsWith('invoices/'));
    expect(invoices).toHaveLength(1); // only Dora
    const reviewed = fake.writes.filter(w => w.op === 'update' && w.data['state'] === 'review');
    expect(reviewed.map(w => w.path)).toEqual(['member-fees/f1', 'member-fees/f2', 'member-fees/f3']);
    expect(reviewed[0].data['notes']).toBe('Wohnen nicht mehr an derselben Adresse');
    expect(result).toMatchObject({ processed: 4, invoiced: 1, review: 3 });
  });

  it('posts the household rows one by one when the payer person is missing', async () => {
    const data = seed();
    data.persons = {} as never;
    const fake = fakeDb(data);
    vi.mocked(getFirestore).mockReturnValue(fake.db as never);
    vi.mocked(postalOf).mockResolvedValue(postal);

    const result = await call();

    expect(fake.writes.filter(w => w.op === 'set' && w.path.startsWith('invoices/'))).toHaveLength(4);
    expect(result).toMatchObject({ invoiced: 4, review: 0 });
  });
});
