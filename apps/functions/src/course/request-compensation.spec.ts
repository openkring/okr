import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AvatarInfo, CalEventModel } from '@okr/shared-models';
import { MoneyModel } from '@okr/shared-models';
import type { CompensationLine } from '@okr/calendar-course-util';

vi.mock('../ocr/resolve-treasurer', () => ({
  resolveTreasurer: vi.fn(async () => ({ key: 'pT', name1: 'Tina', name2: 'Kasse' })),
}));

import {
  coalesceFinance,
  compensationBookingKey,
  compensationBookingTitle,
  duplicateEligibleKeys,
  foreignBookingReason,
  invalidEligibleKeys,
  invalidRates,
  planCompensationBookings,
  requestCompensation,
} from './request-compensation';

const person = (key: string): AvatarInfo => ({ key, name1: `F${key}`, name2: `L${key}`, modelType: 'person', type: '', subType: '', label: `F${key} L${key}` });
const line = (key: string, amount: number, ledCount = amount / 1000): CompensationLine =>
  ({ person: person(key), ledCount, rate: new MoneyModel(1000, 'CHF', 'one-time'), amount });

describe('planCompensationBookings', () => {
  it('replaces forReview drafts, keeps posted bookings and skips zero amounts (brief)', () => {
    const lines = [line('p1', 5000), line('p2', 0), line('p3', 8000)];
    const plan = planCompensationBookings(lines, {
      'course-c1-p1': { okey: 'course-c1-p1', status: 'forReview', amount: 4000 },
      'course-c1-p3': { okey: 'course-c1-p3', status: 'posted', amount: 6000 },
    }, 'c1');
    expect(plan.write.map(l => l.person.key)).toEqual(['p1']);
    expect(plan.keep).toEqual([{ line: lines[2], posted: 6000 }]);
    expect(plan.skipped.map(l => l.person.key)).toEqual(['p2']);
    expect(plan.retire).toEqual([]);
    expect(plan.strayPosted).toEqual([]);
  });

  it('writes new lines and rewrites a draft, but never a cancelled (rejected) booking', () => {
    const lines = [line('p1', 1000), line('p2', 2000), line('p3', 3000)];
    const plan = planCompensationBookings(lines, {
      'course-c1-p2': { okey: 'course-c1-p2', status: 'draft', amount: 1 },
      'course-c1-p3': { okey: 'course-c1-p3', status: 'cancelled', amount: 2500 },
    }, 'c1');
    expect(plan.write.map(l => l.person.key)).toEqual(['p1', 'p2']);
    expect(plan.cancelled).toEqual([{ line: lines[2], amount: 2500 }]);
    expect(plan.keep).toEqual([]);
  });

  it('keeps a posted booking even when the new amount is 0 (the difference is reported, never skipped)', () => {
    const zero = line('p1', 0);
    const plan = planCompensationBookings([zero], { 'course-c1-p1': { okey: 'course-c1-p1', status: 'posted', amount: 3000 } }, 'c1');
    expect(plan.keep).toEqual([{ line: zero, posted: 3000 }]);
    expect(plan.skipped).toEqual([]);
    expect(plan.retire).toEqual([]);
  });

  it('retires a draft or forReview booking whose amount fell to 0, reports a cancelled one untouched', () => {
    const lines = [line('p1', 0), line('p2', 0), line('p3', 0)];
    const plan = planCompensationBookings(lines, {
      'course-c1-p1': { okey: 'course-c1-p1', status: 'forReview', amount: 4000 },
      'course-c1-p2': { okey: 'course-c1-p2', status: 'draft', amount: 4000 },
      'course-c1-p3': { okey: 'course-c1-p3', status: 'cancelled', amount: 4000 },
    }, 'c1');
    expect(plan.skipped.map(l => l.person.key)).toEqual(['p1', 'p2']);
    expect(plan.cancelled).toEqual([{ line: lines[2], amount: 4000 }]);
    expect(plan.retire).toEqual(['course-c1-p1', 'course-c1-p2']);
    expect(plan.write).toEqual([]);
  });

  it('retires the open booking of a person no longer eligible and reports a posted one', () => {
    const plan = planCompensationBookings([line('p1', 1000)], {
      'course-c1-gone': { okey: 'course-c1-gone', status: 'forReview', amount: 2000, personKey: 'gone' },
      'course-c1-paid': { okey: 'course-c1-paid', status: 'posted', amount: 5000, personKey: 'paid' },
      'course-c1-old': { okey: 'course-c1-old', status: 'cancelled', amount: 5000, personKey: 'old' },
    }, 'c1');
    expect(plan.write.map(l => l.person.key)).toEqual(['p1']);
    expect(plan.retire).toEqual(['course-c1-gone']);
    expect(plan.strayPosted.map(b => b.okey)).toEqual(['course-c1-paid']);
    expect(plan.cancelled).toEqual([]);   // a rejected booking of a person who left is simply left alone
  });
});

describe('helpers', () => {
  it('compensationBookingKey is course-<courseKey>-<personKey>', () => {
    expect(compensationBookingKey('c1', 'p1')).toBe('course-c1-p1');
  });

  it('duplicateEligibleKeys lists each repeated person key once', () => {
    expect(duplicateEligibleKeys([{ person: person('a') }, { person: person('b') }, { person: person('a') }, { person: person('a') }])).toEqual(['a']);
    expect(duplicateEligibleKeys([{ person: person('a') }, { person: person('b') }])).toEqual([]);
  });

  it('invalidEligibleKeys rejects empty keys and keys with - or / (the okey is course-<c>-<p>)', () => {
    expect(invalidEligibleKeys(['ok_1', 'AbC9', '', 'p-1', 'a/b', 'x y'].map(k => ({ person: person(k) })))).toEqual(['', 'p-1', 'a/b', 'x y']);
  });

  it('invalidRates rejects NaN, fractional, negative and foreign-currency rates', () => {
    const chf = (amount: number) => ({ amount, currency: 'CHF', periodicity: 'one-time' }) as MoneyModel;
    const ok = { defaultRate: chf(5000), eligible: [{ person: person('a') }, { person: person('b'), rate: chf(0) }] };
    expect(invalidRates(ok, 'CHF')).toEqual([]);
    expect(invalidRates({ ...ok, defaultRate: chf(Number.NaN) }, 'CHF')).toEqual(['defaultRate']);
    expect(invalidRates({ ...ok, defaultRate: chf(50.5) }, 'CHF')).toEqual(['defaultRate']);
    expect(invalidRates({ ...ok, eligible: [{ person: person('n'), rate: chf(-100) }] }, 'CHF')).toEqual(['n']);
    expect(invalidRates({ ...ok, eligible: [{ person: person('e'), rate: { amount: 100, currency: 'EUR', periodicity: 'one-time' } as MoneyModel }] }, 'CHF')).toEqual(['e']);
    expect(invalidRates(ok, 'EUR')).toEqual(['defaultRate', 'b']);
  });

  it('foreignBookingReason accepts only this tenant, these books and that person', () => {
    const exp = { tenantId: 'scs', accountingTenantId: 'scs', personKey: 'p1' };
    const b = { tenants: ['scs'], accountingTenantId: 'scs', counterparty: person('p1') };
    expect(foreignBookingReason(b, exp)).toBe('');
    expect(foreignBookingReason({ ...b, tenants: ['other'] }, exp)).toBe('other-tenant');
    expect(foreignBookingReason({ ...b, accountingTenantId: 'gss' }, exp)).toBe('other-books');
    expect(foreignBookingReason({ ...b, counterparty: person('p9') }, exp)).toBe('other-person');
  });

  it('coalesceFinance fills fields a legacy or partial doc lacks', () => {
    const f = coalesceFinance({ accountingTenantId: 'scs' }, 'EUR');
    expect(f.defaultRate.amount).toBe(0);
    expect(f.defaultRate.currency).toBe('EUR');
    expect(f.eligible).toEqual([]);
    expect(f.accountKey).toBe('');
    expect(f.costCenterKey).toBe('');
  });

  it('compensationBookingTitle names course, period, count and rate', () => {
    expect(compensationBookingTitle('U14', '20260401', '20261031', line('p1', 5000, 5)))
      .toBe('Trainerentschädigung U14 01.04.2026–31.10.2026: 5 × CHF 10.00');
  });
});

// ---------------------------------------------------------------------------------------------
// The handler, against an in-memory Firestore double (only what requestCompensation touches).
// ---------------------------------------------------------------------------------------------

type Data = Record<string, unknown>;

function getPath(data: Data, field: string): unknown {
  return field.split('.').reduce<unknown>((v, k) => (v as Data | undefined)?.[k], data);
}

function fakeDb(initial: Record<string, Data>) {
  const store = new Map<string, Data>(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const snap = (path: string) => {
    const data = store.get(path);
    return { id: path.split('/').pop() ?? '', exists: data !== undefined, data: () => (data ? structuredClone(data) : undefined), ref: docRef(path) };
  };
  function docRef(path: string): Data {
    return {
      path, id: path.split('/').pop(),
      get: async () => snap(path),
      collection: (sub: string) => collection(`${path}/${sub}`),
    };
  }
  function query(name: string, filters: { field: unknown; op: string; value: unknown }[], max?: number): Data {
    const run = () => {
      const docs = [...store.keys()]
        .filter(p => p.startsWith(`${name}/`) && !p.slice(name.length + 1).includes('/'))
        .sort()
        .map(snap)
        .filter(s => filters.every(f => {
          const v = typeof f.field === 'string' ? getPath(s.data() as Data, f.field) : s.id;
          switch (f.op) {
            case '==': return v === f.value;
            case 'array-contains': return Array.isArray(v) && v.includes(f.value);
            case '>=': return (v as string) >= (f.value as string);
            case '<': return (v as string) < (f.value as string);
            default: throw new Error(`fake: op ${f.op}`);
          }
        }));
      const sliced = max === undefined ? docs : docs.slice(0, max);
      return { empty: sliced.length === 0, docs: sliced, size: sliced.length };
    };
    return {
      isQuery: true,
      where: (field: unknown, op: string, value: unknown) => query(name, [...filters, { field, op, value }], max),
      limit: (n: number) => query(name, filters, n),
      get: async () => run(),
      run,
    };
  }
  function collection(name: string): Data {
    return { ...query(name, []), doc: (id: string) => docRef(`${name}/${id}`) };
  }
  const db = {
    collection,
    getAll: async (...refs: { path: string }[]) => refs.map(r => snap(r.path)),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const writes: (() => void)[] = [];
      const tx = {
        get: async (r: Data) => (r['isQuery'] ? (r['run'] as () => unknown)() : snap(r['path'] as string)),
        getAll: async (...refs: { path: string }[]) => refs.map(r => snap(r.path)),
        set: (r: { path: string }, data: Data) => { writes.push(() => store.set(r.path, structuredClone(data))); return tx; },
        update: (r: { path: string }, data: Data) => {
          writes.push(() => {
            const cur = store.get(r.path);
            if (!cur) throw new Error(`fake: update of missing ${r.path}`);
            store.set(r.path, { ...cur, ...structuredClone(data) });
          });
          return tx;
        },
        delete: (r: { path: string }) => { writes.push(() => store.delete(r.path)); return tx; },
      };
      const result = await fn(tx);
      writes.forEach(w => w());
      return result;
    },
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, store };
}

const CALLER_UID = 'u1';
const NOW = new Date('2026-11-02T10:30:00Z'); // 11:30 in Zurich

function event(okey: string, startDate: string, leaders: string[]): Data {
  const attendance: Record<string, unknown> = {};
  for (const k of leaders) attendance[k] = { person: person(k), presence: 'present', function: 'leader', by: 'pR', at: '' };
  return { okey, tenants: ['scs'], isArchived: false, courseKey: 'c1', startDate, startTime: '18:00', attendance } as Partial<CalEventModel> as Data;
}

function world(over: Record<string, Data | undefined> = {}): Record<string, Data> {
  const base: Record<string, Data | undefined> = {
    'users/u1': { tenants: ['scs'], personKey: 'pR', firstName: 'Rita', lastName: 'Resp', roles: {} },
    'courses/c1': { tenants: ['scs'], name: 'U14', groupKey: 'g1', startDate: '20260401', endDate: '20261031', isLocked: true, responsibleKeys: ['pR'] },
    'courses/c1/finance/settings': {
      accountingTenantId: 'scs', accountKey: 'acc-5000', costCenterKey: 'cc-1',
      defaultRate: { amount: 5000, currency: 'CHF', periodicity: 'one-time' },
      eligible: [{ person: person('p1') }, { person: person('p2'), rate: { amount: 8000, currency: 'CHF', periodicity: 'one-time' } }, { person: person('p3') }],
    },
    'groups/g1': { tenants: ['scs'], adminKeys: ['pG'] },
    'accounting-configs/scs': { tenants: ['scs'], accountingBackend: 'native', employeePayablesAccountKey: 'acc-2000', defaultCompensationAccountKey: 'acc-5999', reviewAssigneePersonKey: '' },
    'accounts/acc-5000': { tenants: ['scs'], accountingTenantId: 'scs', id: '5000' },
    'accounts/acc-5999': { tenants: ['scs'], accountingTenantId: 'scs', id: '5999' },
    'accounts/acc-2000': { tenants: ['scs'], accountingTenantId: 'scs', id: '2000' },
    'cost-centers/cc-1': { tenants: ['scs'], accountingTenantId: 'scs', isArchived: false, parentKey: '' },
    'app-config/scs': { appDomain: 'example.org' },
    'calevents/e1': event('e1', '20260410', ['p1', 'p2']),
    'calevents/e2': event('e2', '20260417', ['p1']),
    'calevents/e3': { ...event('e3', '20260424', ['p1']), tenants: ['other'] },     // another tenant: never counted
    'calevents/e4': { ...event('e4', '20260501', ['p1']), isArchived: true },     // archived: not counted
    ...over,
  };
  return Object.fromEntries(Object.entries(base).filter((e): e is [string, Data] => e[1] !== undefined));
}

const call = (db: FirebaseFirestore.Firestore, data: Data = { courseKey: 'c1', accountingTenantId: 'scs' }) =>
  requestCompensation(db, CALLER_UID, data as never, NOW);

async function rejection(p: Promise<unknown>): Promise<{ code: string; details?: Data }> {
  try { await p; } catch (e) { return e as { code: string; details?: Data }; }
  throw new Error('expected a rejection');
}

describe('requestCompensation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes one forReview booking with two lines per owed trainer, the task and the request stamp', async () => {
    const { db, store } = fakeDb(world());
    const result = await call(db);

    expect(result.nativeBooks).toBe(true);
    expect(result.written).toBe(2);           // p1 (2 × 50) and p2 (1 × 80); p3 led nothing
    expect(result.kept).toEqual([]);
    expect(result.cancelled).toEqual([]);
    expect(result.taskKey).toBe('course-c1-compensation');

    const b1 = store.get('bookings/course-c1-p1')!;
    expect(b1).toMatchObject({
      tenants: ['scs'], status: 'forReview', bookingNo: 0, date: '20261102', accountingTenantId: 'scs',
      title: 'Trainerentschädigung U14 01.04.2026–31.10.2026: 2 × CHF 50.00',
    });
    expect((b1['counterparty'] as AvatarInfo).key).toBe('p1');
    expect(store.get('booking-lines/course-c1-p1-d')).toMatchObject({
      bookingKey: 'course-c1-p1', accountKey: 'acc-5000', costCenterKey: 'cc-1', accountingTenantId: 'scs',
      debitAmount: { amount: 10000, currency: 'CHF' },
    });
    expect(store.get('booking-lines/course-c1-p1-c')).toMatchObject({
      bookingKey: 'course-c1-p1', accountKey: 'acc-2000', creditAmount: { amount: 10000, currency: 'CHF' },
    });
    expect(store.get('booking-lines/course-c1-p1-c')!['costCenterKey']).toBeUndefined();
    expect(store.get('booking-lines/course-c1-p2-d')).toMatchObject({ debitAmount: { amount: 8000 } });
    expect(store.has('bookings/course-c1-p3')).toBe(false);

    const task = store.get('tasks/course-c1-compensation')!;
    expect(task).toMatchObject({
      tenants: ['scs'], name: 'Trainerentschädigung prüfen: U14', linkModelType: 'course', linkKey: 'course.c1', state: 'initial',
    });
    expect((task['assignee'] as AvatarInfo).key).toBe('pT');
    expect(task['notes']).toContain('Fp1 Lp1: 2 × CHF 50.00 = CHF 100.00');
    expect(task['notes']).toContain('https://app.example.org/course/table/c1');

    const fin = store.get('courses/c1/finance/settings')!;
    expect(fin['requestedAt']).toBe('20261102113000');
    expect((fin['requestedBy'] as AvatarInfo).key).toBe('pR');
  });

  it('falls back to the books default compensation account', async () => {
    const w = world();
    w['courses/c1/finance/settings'] = { ...w['courses/c1/finance/settings'], accountKey: '', costCenterKey: '' };
    const { db, store } = fakeDb(w);
    await call(db);
    expect(store.get('booking-lines/course-c1-p1-d')!['accountKey']).toBe('acc-5999');
  });

  it('keeps a posted booking, reports posted vs computed, and does not touch it', async () => {
    const { db, store } = fakeDb(world({
      'bookings/course-c1-p1': { tenants: ['scs'], status: 'posted', bookingNo: 7, counterparty: person('p1') },
      'booking-lines/x-d': { bookingKey: 'course-c1-p1', debitAmount: { amount: 9000 } },
      'booking-lines/x-c': { bookingKey: 'course-c1-p1', creditAmount: { amount: 9000 } },
    }));
    const result = await call(db);
    expect(result.written).toBe(1);
    expect(result.kept).toEqual([{ personKey: 'p1', posted: 9000, computed: 10000 }]);
    expect(store.get('bookings/course-c1-p1')).toMatchObject({ status: 'posted', bookingNo: 7 });
    expect(store.has('booking-lines/course-c1-p1-d')).toBe(false);
  });

  it('overwrites a forReview draft and drops its stray lines', async () => {
    const { db, store } = fakeDb(world({
      'bookings/course-c1-p1': { tenants: ['scs'], accountingTenantId: 'scs', status: 'forReview', counterparty: person('p1'), createdAt: '20261001120000' },
      'booking-lines/course-c1-p1-d': { bookingKey: 'course-c1-p1', debitAmount: { amount: 1 } },
      'booking-lines/old-line': { bookingKey: 'course-c1-p1', creditAmount: { amount: 1 } },
    }));
    await call(db);
    expect(store.get('booking-lines/course-c1-p1-d')).toMatchObject({ debitAmount: { amount: 10000 } });
    expect(store.has('booking-lines/old-line')).toBe(false);
    expect(store.get('bookings/course-c1-p1')).toMatchObject({ status: 'forReview', createdAt: '20261001120000' });
  });

  it('deletes the open draft (and its lines) of a trainer who is owed nothing any more', async () => {
    const { db, store } = fakeDb(world({
      'bookings/course-c1-p3': { tenants: ['scs'], accountingTenantId: 'scs', status: 'forReview', counterparty: person('p3'), notes: '' },
      'booking-lines/course-c1-p3-d': { bookingKey: 'course-c1-p3', debitAmount: { amount: 5000 } },
      'booking-lines/course-c1-p3-c': { bookingKey: 'course-c1-p3', creditAmount: { amount: 5000 } },
    }));
    await call(db);
    expect(store.has('bookings/course-c1-p3')).toBe(false);
    expect(store.has('booking-lines/course-c1-p3-d')).toBe(false);
    expect(store.has('booking-lines/course-c1-p3-c')).toBe(false);
  });

  it('deletes the open draft of a person no longer eligible, ignores another course with a similar key', async () => {
    const { db, store } = fakeDb(world({
      'bookings/course-c1-gone': { tenants: ['scs'], accountingTenantId: 'scs', status: 'forReview', counterparty: person('gone'), notes: '' },
      'bookings/course-c1-x-p9': { tenants: ['scs'], accountingTenantId: 'scs', status: 'forReview', counterparty: person('p9'), notes: '' },
    }));
    await call(db);
    expect(store.has('bookings/course-c1-gone')).toBe(false);
    expect(store.get('bookings/course-c1-x-p9')!['status']).toBe('forReview');
  });

  it('never touches a cancelled (rejected) booking and reports it', async () => {
    const rejected = { tenants: ['scs'], accountingTenantId: 'scs', status: 'cancelled', counterparty: person('p1'), notes: '[Abgelehnt 01.11.2026, Tina Kasse] doppelt' };
    const { db, store } = fakeDb(world({
      'bookings/course-c1-p1': rejected,
      'booking-lines/course-c1-p1-d': { bookingKey: 'course-c1-p1', debitAmount: { amount: 7000 } },
    }));
    const result = await call(db);
    expect(result.written).toBe(1);   // p2 only
    expect(result.cancelled).toEqual([{ personKey: 'p1', amount: 7000, computed: 10000 }]);
    expect(store.get('bookings/course-c1-p1')).toEqual(rejected);
    expect(store.get('booking-lines/course-c1-p1-d')).toEqual({ bookingKey: 'course-c1-p1', debitAmount: { amount: 7000 } });
    expect(store.get('tasks/course-c1-compensation')!['notes']).toContain('Abgelehnt');
  });

  it('refuses to overwrite a booking at the okey that belongs to other books, another tenant or another person', async () => {
    for (const foreign of [
      { tenants: ['scs'], accountingTenantId: 'gss', status: 'forReview', counterparty: person('p1') },
      { tenants: ['other'], accountingTenantId: 'scs', status: 'forReview', counterparty: person('p1') },
      { tenants: ['scs'], accountingTenantId: 'scs', status: 'forReview', counterparty: person('p9') },
    ]) {
      const { db, store } = fakeDb(world({ 'bookings/course-c1-p1': foreign }));
      const err = await rejection(call(db));
      expect(err.code).toBe('failed-precondition');
      expect(err.details?.['reason']).toBe('foreign-booking');
      expect(store.get('bookings/course-c1-p1')).toEqual(foreign);
      expect(store.has('bookings/course-c1-p2')).toBe(false);   // nothing of the transaction was written
    }
  });

  it('refuses a person key that is not a plain doc id', async () => {
    for (const key of ['p-1', 'a/b', '']) {
      const w = world();
      w['courses/c1/finance/settings'] = { ...w['courses/c1/finance/settings'], eligible: [{ person: person(key) }] };
      const err = await rejection(call(fakeDb(w).db));
      expect(err.code).toBe('invalid-argument');
      expect(err.details?.['reason']).toBe('invalid-person-key');
    }
  });

  it('refuses invalid rates: NaN, fractional, negative, foreign currency', async () => {
    const bad = [
      { defaultRate: { amount: Number.NaN, currency: 'CHF', periodicity: 'one-time' } },
      { defaultRate: { amount: 50.5, currency: 'CHF', periodicity: 'one-time' } },
      { eligible: [{ person: person('p1'), rate: { amount: -100, currency: 'CHF', periodicity: 'one-time' } }] },
      { eligible: [{ person: person('p1'), rate: { amount: 100, currency: 'EUR', periodicity: 'one-time' } }] },
    ];
    for (const patch of bad) {
      const w = world();
      w['courses/c1/finance/settings'] = { ...w['courses/c1/finance/settings'], ...patch };
      const { db, store } = fakeDb(w);
      const err = await rejection(call(db));
      expect(err.code).toBe('invalid-argument');
      expect(err.details?.['reason']).toBe('invalid-rate');
      expect(store.get('courses/c1/finance/settings')!['requestedAt']).toBeUndefined();
    }
  });

  it('checks the rates against the books functional currency', async () => {
    const w = world();
    w['accounting-configs/scs'] = { ...w['accounting-configs/scs'], functionalCurrency: 'EUR' };
    expect((await rejection(call(fakeDb(w).db))).details?.['reason']).toBe('invalid-rate');
  });

  it('refuses accounts that are not in these books, and a debit account that is not an expense account', async () => {
    const cases: [Record<string, Data>, string][] = [
      [{ 'accounts/acc-5000': { tenants: ['scs'], accountingTenantId: 'gss', id: '5000' } }, 'debit'],   // other books
      [{ 'accounts/acc-2000': { tenants: ['other'], accountingTenantId: 'scs', id: '2000' } }, 'credit'],  // other tenant
      [{ 'accounts/acc-5000': { tenants: ['scs'], accountingTenantId: 'scs', id: '1020' } }, 'debit'],   // balance-sheet account
    ];
    for (const [patch, side] of cases) {
      const w = world();
      Object.assign(w, patch);
      const { db, store } = fakeDb(w);
      const err = await rejection(call(db));
      expect(err.code).toBe('failed-precondition');
      expect(err.details).toMatchObject({ reason: 'invalid-account', account: side });
      expect(store.has('bookings/course-c1-p1')).toBe(false);
    }
    const w = world();
    delete w['accounts/acc-2000'];
    expect((await rejection(call(fakeDb(w).db))).details).toMatchObject({ reason: 'invalid-account', account: 'credit' });
  });

  it('refuses an explicit Kostenstelle that is not an active leaf of these books', async () => {
    for (const center of [
      { tenants: ['scs'], accountingTenantId: 'scs', isArchived: true, parentKey: '' },
      { tenants: ['scs'], accountingTenantId: 'gss', isArchived: false, parentKey: '' },
    ]) {
      const err = await rejection(call(fakeDb(world({ 'cost-centers/cc-1': center })).db));
      expect(err.code).toBe('invalid-argument');
      expect(err.details?.['reason']).toBe('cost-center-invalid');
    }
  });

  it('refuses an archived course', async () => {
    const w = world();
    w['courses/c1'] = { ...w['courses/c1'], isArchived: true };
    const err = await rejection(call(fakeDb(w).db));
    expect(err.code).toBe('failed-precondition');
    expect(err.details?.['reason']).toBe('course-archived');
  });

  it('leaves the task state alone when an unchanged re-request yields the same settlement, reopens it on a change', async () => {
    const { db, store } = fakeDb(world());
    await call(db);
    store.set('tasks/course-c1-compensation', { ...store.get('tasks/course-c1-compensation')!, state: 'done' });
    await call(db);
    expect(store.get('tasks/course-c1-compensation')!['state']).toBe('done');

    store.set('calevents/e9', event('e9', '20260515', ['p2']));   // p2 led one more training
    await call(db);
    expect(store.get('tasks/course-c1-compensation')!['state']).toBe('initial');
    expect(store.get('booking-lines/course-c1-p2-d')).toMatchObject({ debitAmount: { amount: 16000 } });
  });

  it('names a posted booking of a person no longer eligible in the books currency', async () => {
    const eur = { amount: 5000, currency: 'EUR', periodicity: 'one-time' };
    const w = world({
      'bookings/course-c1-paid': { tenants: ['scs'], accountingTenantId: 'scs', status: 'posted', counterparty: person('paid') },
      'booking-lines/paid-d': { bookingKey: 'course-c1-paid', debitAmount: { amount: 4000 } },
    });
    w['accounting-configs/scs'] = { ...w['accounting-configs/scs'], functionalCurrency: 'EUR' };
    w['courses/c1/finance/settings'] = { ...w['courses/c1/finance/settings'], defaultRate: eur, eligible: [{ person: person('p1') }] };
    const { db, store } = fakeDb(w);
    const result = await call(db);
    expect(result.kept).toEqual([{ personKey: 'paid', posted: 4000, computed: 0 }]);
    const notes = store.get('tasks/course-c1-compensation')!['notes'] as string;
    expect(notes).toContain('paid: gebucht EUR 40.00, nicht mehr berechtigt');
    expect(notes).not.toContain('CHF');
  });

  it('lets a privileged caller and a group admin of the same tenant request', async () => {
    for (const user of [
      { tenants: ['scs'], personKey: 'pX', roles: { privileged: true } },
      { tenants: ['scs'], personKey: 'pX', roles: { admin: true } },
      { tenants: ['scs'], personKey: 'pG', roles: {} },
    ]) {
      const { db } = fakeDb(world({ 'users/u1': user }));
      await expect(call(db)).resolves.toMatchObject({ written: 2 });
    }
  });

  it('refuses a trainer, a treasurer and a group admin of another tenant', async () => {
    for (const [user, group] of [
      [{ tenants: ['scs'], personKey: 'p1', roles: {} }, undefined],
      [{ tenants: ['scs'], personKey: 'pX', roles: { treasurer: true } }, undefined],
      [{ tenants: ['scs'], personKey: 'pG', roles: {} }, { tenants: ['other'], adminKeys: ['pG'] }],
    ] as const) {
      const { db } = fakeDb(world({ 'users/u1': user as Data, ...(group ? { 'groups/g1': group as Data } : {}) }));
      expect((await rejection(call(db))).code).toBe('permission-denied');
    }
  });

  it('refuses a course of another tenant', async () => {
    const w = world();
    w['courses/c1'] = { ...w['courses/c1'], tenants: ['other'] };
    expect((await rejection(call(fakeDb(w).db))).code).toBe('permission-denied');
  });

  it('refuses a course that is not locked', async () => {
    const w = world();
    w['courses/c1'] = { ...w['courses/c1'], isLocked: false };
    const err = await rejection(call(fakeDb(w).db));
    expect(err.code).toBe('failed-precondition');
    expect(err.details?.['reason']).toBe('course-not-locked');
  });

  it('requires the books in the request and refuses books other than the finance doc names', async () => {
    expect((await rejection(call(fakeDb(world()).db, { courseKey: 'c1' }))).code).toBe('invalid-argument');
    const err = await rejection(call(fakeDb(world()).db, { courseKey: 'c1', accountingTenantId: 'gss' }));
    expect(err.code).toBe('invalid-argument');
    expect(err.details?.['reason']).toBe('books-mismatch');
  });

  it('refuses books that do not belong to the caller tenant', async () => {
    const w = world();
    w['accounting-configs/scs'] = { ...w['accounting-configs/scs'], tenants: ['other'] };
    expect((await rejection(call(fakeDb(w).db))).code).toBe('permission-denied');
  });

  it('books kept outside Kring (bexio, D14): no bookings, but the settlement task and the request stamp', async () => {
    const w = world();
    // no accounts at all: the bexio path needs none
    w['accounting-configs/scs'] = { ...w['accounting-configs/scs'], accountingBackend: 'bexio', employeePayablesAccountKey: '', defaultCompensationAccountKey: '' };
    w['courses/c1/finance/settings'] = { ...w['courses/c1/finance/settings'], accountKey: '', costCenterKey: 'cc-gone' };
    const { db, store } = fakeDb(w);
    const result = await call(db);
    expect(result).toMatchObject({ nativeBooks: false, written: 0, kept: [], cancelled: [], taskKey: 'course-c1-compensation' });
    expect([...store.keys()].some(k => k.startsWith('bookings/') || k.startsWith('booking-lines/'))).toBe(false);
    const notes = store.get('tasks/course-c1-compensation')!['notes'] as string;
    expect(notes).toContain('ausserhalb von Kring');
    expect(notes).toContain('Fp1 Lp1: 2 × CHF 50.00 = CHF 100.00');
    expect(notes).toContain('Fp2 Lp2: 1 × CHF 80.00 = CHF 80.00');
    expect(notes).toContain('https://app.example.org/course/table/c1');
    expect(store.get('courses/c1/finance/settings')!['requestedAt']).toBe('20261102113000');
  });

  it('native books: the same course writes bookings (the counterpart of the bexio path)', async () => {
    const { db, store } = fakeDb(world());
    const result = await call(db);
    expect(result.nativeBooks).toBe(true);
    expect(store.has('bookings/course-c1-p1')).toBe(true);
    expect(store.get('tasks/course-c1-compensation')!['notes']).toContain('Entwürfe zur Prüfung im Journal');
  });

  it('refuses when no expense or payables account is set', async () => {
    const w1 = world();
    w1['courses/c1/finance/settings'] = { ...w1['courses/c1/finance/settings'], accountKey: '' };
    w1['accounting-configs/scs'] = { ...w1['accounting-configs/scs'], defaultCompensationAccountKey: '' };
    const e1 = await rejection(call(fakeDb(w1).db));
    expect(e1.code).toBe('failed-precondition');
    expect(e1.details?.['reason']).toBe('missing-account');

    const w2 = world();
    w2['accounting-configs/scs'] = { ...w2['accounting-configs/scs'], employeePayablesAccountKey: '' };
    expect((await rejection(call(fakeDb(w2).db))).details?.['reason']).toBe('missing-account');
  });

  it('refuses a finance doc that lists a person twice', async () => {
    const w = world();
    w['courses/c1/finance/settings'] = { ...w['courses/c1/finance/settings'], eligible: [{ person: person('p1') }, { person: person('p1') }] };
    const err = await rejection(call(fakeDb(w).db));
    expect(err.code).toBe('invalid-argument');
    expect(err.details?.['reason']).toBe('duplicate-eligible');
  });

  it('coalesces a finance doc without defaultRate and eligible: nothing to book, still a task', async () => {
    const w = world();
    w['courses/c1/finance/settings'] = { accountingTenantId: 'scs' };
    const { db, store } = fakeDb(w);
    const result = await call(db);
    expect(result.written).toBe(0);
    expect(store.has('tasks/course-c1-compensation')).toBe(true);
  });

  it('names leaders who are not eligible in the task and the response', async () => {
    const w = world();
    w['calevents/e5'] = event('e5', '20260508', ['pZ']);
    const { db, store } = fakeDb(w);
    const result = await call(db);
    expect(result.unlistedKeys).toEqual(['pZ']);
    expect(store.get('tasks/course-c1-compensation')!['notes']).toContain('FpZ LpZ');
  });
});
