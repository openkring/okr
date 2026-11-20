/**
 * The money seams of the Trainer-Abrechnung (spec 1.167 §7.4–§7.6) against an in-memory Firestore double with
 * transactions (pattern: course/request-compensation.spec.ts): send, resend after reject, reject, and the bill mirror.
 * The PDF render, the private bucket and the finance history are mocked; everything else runs as in production.
 */
import { logger } from 'firebase-functions/v2';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainerAgreementModel, TrainerProfileModel, WorkEntryModel } from '@okr/shared-models';

const deletedPaths: string[] = [];
vi.mock('../_storage/private-bucket', () => ({
  privateBucket: () => ({ file: (path: string) => ({ delete: async () => { deletedPaths.push(path); } }) }),
}));
vi.mock('../finance-history/finance-history', () => ({ writeFinanceHistory: vi.fn(async () => undefined) }));

let context: InvoiceContext;
type RenderPdf = (ctx: unknown, p: { invoiceNo: string; sink: { path: string } }) => Promise<{ sizeBytes: number }>;
const renderPdf = vi.fn<RenderPdf>(async () => ({ sizeBytes: 1234 }));
vi.mock('./trainer-invoice-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./trainer-invoice-context')>();
  return {
    ...actual,
    loadInvoiceContext: vi.fn(async () => context),
    renderTrainerInvoicePdf: (ctx: unknown, p: { invoiceNo: string; sink: { path: string } }) => renderPdf(ctx, p),
  };
});

import { mirrorBillToInvoice } from './on-bill-written';
import { rejectInvoice } from './reject-trainer-invoice';
import { sendInvoice } from './send-trainer-invoice';
import type { InvoiceContext } from './trainer-invoice-context';

// ---------------------------------------------------------------------------------------------
// In-memory Firestore double (only what the trainer-billing functions touch)
// ---------------------------------------------------------------------------------------------

type Data = Record<string, unknown>;

function fakeDb(initial: Record<string, Data>) {
  const store = new Map<string, Data>(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const snap = (path: string) => {
    const data = store.get(path);
    return {
      id: path.split('/').pop() ?? '', exists: data !== undefined, ref: docRef(path),
      data: () => (data ? structuredClone(data) : undefined),
      get: (field: string) => (data ? structuredClone(data[field]) : undefined),
    };
  };
  function docRef(path: string): Data {
    return {
      path, id: path.split('/').pop(),
      get: async () => snap(path),
      set: async (data: Data) => { store.set(path, structuredClone(data)); },
    };
  }
  function query(name: string, filters: { field: string; value: unknown }[]): Data {
    const run = () => {
      const docs = [...store.keys()]
        .filter((p) => p.startsWith(`${name}/`) && !p.slice(name.length + 1).includes('/'))
        .sort()
        .map(snap)
        .filter((s) => filters.every((f) => (s.data() as Data)[f.field] === f.value));
      return { empty: docs.length === 0, docs, size: docs.length };
    };
    return {
      isQuery: true,
      where: (field: string, op: string, value: unknown) => {
        if (op !== '==') throw new Error(`fake: op ${op}`);
        return query(name, [...filters, { field, value }]);
      },
      get: async () => run(),
      run,
    };
  }
  const collection = (name: string): Data => ({ ...query(name, []), doc: (id: string) => docRef(`${name}/${id}`) });
  const db = {
    collection,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const writes: (() => void)[] = [];
      const tx = {
        get: async (r: Data) => (r['isQuery'] ? (r['run'] as () => unknown)() : snap(r['path'] as string)),
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
      writes.forEach((w) => w());
      return result;
    },
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, store };
}

async function rejection(p: Promise<unknown>): Promise<{ code: string; details?: Data }> {
  try { await p; } catch (e) { return e as { code: string; details?: Data }; }
  throw new Error('expected a rejection');
}

// ---------------------------------------------------------------------------------------------
// Fixtures: one agreement (a1) of trainer p1 in the native books scs, July 2026 sent on 30 August
// ---------------------------------------------------------------------------------------------

const IBAN = 'CH9300762011623852957';
const NOW = new Date('2026-08-30T10:00:00Z');
const INVOICE_KEY = 'a1_202607';
const BILL_KEY = `ti-${INVOICE_KEY}`;
const person = { key: 'p1', name1: 'Hans', name2: 'Muster', modelType: 'person', type: '', subType: '', label: 'Hans Muster' };

function agreement(): TrainerAgreementModel {
  return Object.assign(new TrainerAgreementModel('scs'), {
    okey: 'a1', accountingTenantId: 'scs', personKey: 'p1', person, validFrom: '20260101', validTo: '', selfEmployedConfirmed: true,
    services: [
      { key: 'training', name: 'Training', unit: 'hour', rates: [{ validFrom: '20260101', amount: { amount: 5000, currency: 'CHF', periodicity: 'one-time' } }], accountKey: 'acc1', costCenterKey: '', vatCodeKey: '', isArchived: false },
    ],
  });
}

function profile(patch: Partial<TrainerProfileModel> = {}): TrainerProfileModel {
  return Object.assign(new TrainerProfileModel('scs'), { okey: 'p1', companyName: 'Muster Sport', numberTemplate: '{yyyy}-{n}', nextNumber: 7, ...patch });
}

function entry(okey: string, patch: Partial<WorkEntryModel> = {}): WorkEntryModel {
  return Object.assign(new WorkEntryModel('scs'), {
    okey, accountingTenantId: 'scs', personKey: 'p1', agreementKey: 'a1', date: '20260710', serviceKey: 'training', quantity: 2, state: 'open', invoiceKey: '', ...patch,
  });
}

/** A stored document: the model without its okey, as plain data. */
function doc<T extends { okey?: string }>(m: T): Data {
  const { okey: _okey, ...rest } = structuredClone({ ...m }) as T & Data;
  void _okey;
  return rest as Data;
}

function invoiceContext(p: TrainerProfileModel, entries: WorkEntryModel[]): InvoiceContext {
  return {
    uid: 'u1', tenantId: 'scs', callerPersonKey: 'p1', agreementKey: 'a1', month: '2026-07', today: '20260830',
    agreement: agreement(), profile: p, entries,
    booksTenants: ['scs'], nativeBooks: true, defaultAccountKey: 'acc-default', vatRatePercentByCode: {},
    payee: { name: 'Muster Sport', iban: IBAN, qrIban: '', regularIban: IBAN, street: 'Seestrasse', buildingNumber: '1', zip: '8712', city: 'Stäfa', country: 'CH' },
    postalOk: true, trainerName: 'Hans Muster', recipientName: 'Seeclub', recipientAddress: [], logoUrl: '',
    treasurer: { key: 'pT', name1: 'Tina', name2: 'Kasse' },
  };
}

function sendWorld(p: TrainerProfileModel, entries: WorkEntryModel[], over: Record<string, Data> = {}): Record<string, Data> {
  const base: Record<string, Data> = {
    'trainer-agreements/a1': doc(agreement()),
    'trainer-profiles/p1': doc(p),
    'app-config/scs': { appDomain: 'example.org' },
  };
  for (const e of entries) base[`work-entries/${e.okey}`] = doc(e);
  return { ...base, ...over };
}

const send = (db: FirebaseFirestore.Firestore) => sendInvoice(db, 'u1', { agreementKey: 'a1', month: '2026-07' }, NOW);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(logger, 'info').mockImplementation(() => undefined);
  deletedPaths.length = 0;
});

// ---------------------------------------------------------------------------------------------

describe('sendInvoice (transaction)', () => {
  it('writes the invoice, invoices the entries, creates the draft bill ti-<key> and moves the counter', async () => {
    const p = profile();
    const entries = [entry('e1'), entry('e2', { date: '20260702', quantity: 1.5 })];
    context = invoiceContext(p, entries);
    const { db, store } = fakeDb(sendWorld(p, entries));

    const result = await send(db);

    expect(result).toEqual({ invoiceKey: INVOICE_KEY, invoiceNo: '2026-7', billKey: BILL_KEY });
    const invoice = store.get(`trainer-invoices/${INVOICE_KEY}`) as Data;
    expect(invoice).toMatchObject({ state: 'sent', invoiceNo: '2026-7', personKey: 'p1', accountingTenantId: 'scs', billKey: BILL_KEY, total: 17500, tenants: ['scs'] });
    expect(store.get('work-entries/e1')).toMatchObject({ state: 'invoiced', invoiceKey: INVOICE_KEY });
    expect(store.get('work-entries/e2')).toMatchObject({ state: 'invoiced', invoiceKey: INVOICE_KEY });
    const bill = store.get(`bills/${BILL_KEY}`) as Data;
    expect(bill).toMatchObject({ state: 'draft', trainerInvoiceKey: INVOICE_KEY, billId: '2026-7', accountingTenantId: 'scs', attachments: [`trainer-invoice-${INVOICE_KEY}`] });
    expect((bill['totalAmount'] as { amount: number }).amount).toBe(17500);
    expect(store.get('trainer-profiles/p1')).toMatchObject({ nextNumber: 8 });
    expect(store.get(`finance-documents/trainer-invoice-${INVOICE_KEY}`)).toMatchObject({ fullPath: renderPdf.mock.calls[0][1].sink.path });
    expect(store.get(`tasks/trainer-invoice-${INVOICE_KEY}`)).toMatchObject({ linkKey: `bill.${BILL_KEY}` });
    expect(deletedPaths).toEqual([]);
  });

  it('refuses concurrent-send when an entry was added between plan and transaction, and deletes its PDF', async () => {
    const p = profile();
    const planned = [entry('e1'), entry('e2', { date: '20260702', quantity: 1.5 })];
    context = invoiceContext(p, planned);
    const { db, store } = fakeDb(sendWorld(p, [...planned, entry('e3', { date: '20260720', quantity: 1 })]));

    const err = await rejection(send(db));

    expect(err.details?.['reason']).toBe('concurrent-send');
    expect(store.has(`trainer-invoices/${INVOICE_KEY}`)).toBe(false);
    expect(store.has(`bills/${BILL_KEY}`)).toBe(false);
    expect(store.get('work-entries/e1')).toMatchObject({ state: 'open' });
    expect(store.get('trainer-profiles/p1')).toMatchObject({ nextNumber: 7 });
    expect(deletedPaths).toEqual([renderPdf.mock.calls[0][1].sink.path]);
  });

  it('resends a rejected month: same number without {n}, bill recreated, rejection fields cleared, old PDF deleted', async () => {
    const p = profile({ numberTemplate: 'R-{yy}{mm}' });
    const entries = [entry('e1')];
    context = invoiceContext(p, entries);
    const oldPath = `tenant/scs/private/finance/trainer-invoices/${INVOICE_KEY}-old.pdf`;
    const { db, store } = fakeDb(sendWorld(p, entries, {
      [`trainer-invoices/${INVOICE_KEY}`]: {
        tenants: ['scs'], accountingTenantId: 'scs', personKey: 'p1', agreementKey: 'a1', month: '2026-07', invoiceNo: 'R-2607-alt',
        state: 'rejected', billKey: BILL_KEY, rejectedReason: 'Falscher Ansatz', rejectedBy: { key: 'pT' }, rejectedAt: '20260825100000',
      },
      [`finance-documents/trainer-invoice-${INVOICE_KEY}`]: { tenants: ['scs'], fullPath: oldPath },
    }));

    const result = await send(db);

    expect(result.invoiceNo).toBe('R-2607-alt');
    const invoice = store.get(`trainer-invoices/${INVOICE_KEY}`) as Data;
    expect(invoice).toMatchObject({ state: 'sent', invoiceNo: 'R-2607-alt', rejectedReason: '', rejectedAt: '' });
    expect(invoice['rejectedBy']).toBeUndefined();
    expect(store.get(`bills/${BILL_KEY}`)).toMatchObject({ state: 'draft', billId: 'R-2607-alt', trainerInvoiceKey: INVOICE_KEY });
    expect(store.get('trainer-profiles/p1')).toMatchObject({ nextNumber: 7 });
    expect(deletedPaths).toEqual([oldPath]);
  });
});

// ---------------------------------------------------------------------------------------------

function rejectWorld(billState: string): Record<string, Data> {
  return {
    'users/uT': { tenants: ['scs'], personKey: 'pT', firstName: 'Tina', lastName: 'Kasse', roles: { treasurer: true } },
    'accounting-configs/scs': { tenants: ['scs'], accountingBackend: 'native' },
    'trainer-agreements/a1': doc(agreement()),
    [`trainer-invoices/${INVOICE_KEY}`]: {
      tenants: ['scs'], accountingTenantId: 'scs', personKey: 'p1', agreementKey: 'a1', month: '2026-07', invoiceNo: '2026-7', state: 'sent', billKey: BILL_KEY,
    },
    [`bills/${BILL_KEY}`]: { tenants: ['scs'], accountingTenantId: 'scs', state: billState, bookingKeys: [], payments: [], trainerInvoiceKey: INVOICE_KEY },
    'work-entries/e1': doc(entry('e1', { state: 'invoiced', invoiceKey: INVOICE_KEY })),
    'work-entries/e2': doc(entry('e2', { state: 'invoiced', invoiceKey: INVOICE_KEY })),
  };
}

describe('rejectInvoice (transaction)', () => {
  it('deletes the draft bill, sets rejected with reason and frees the entries', async () => {
    const { db, store } = fakeDb(rejectWorld('draft'));

    await rejectInvoice(db, 'uT', { invoiceKey: INVOICE_KEY, reason: 'Falscher Ansatz' }, new Date('2026-08-31T08:00:00Z'));

    expect(store.has(`bills/${BILL_KEY}`)).toBe(false);
    expect(store.get(`trainer-invoices/${INVOICE_KEY}`)).toMatchObject({ state: 'rejected', rejectedReason: 'Falscher Ansatz', rejectedBy: { key: 'pT' } });
    expect(store.get('work-entries/e1')).toMatchObject({ state: 'open', invoiceKey: '' });
    expect(store.get('work-entries/e2')).toMatchObject({ state: 'open', invoiceKey: '' });
    const task = [...store.keys()].find((k) => k.startsWith(`tasks/trainer-invoice-${INVOICE_KEY}-rejected-`));
    expect(task).toBeDefined();
  });

  it('refuses bill-booked when the bill has left draft, and changes nothing', async () => {
    const { db, store } = fakeDb(rejectWorld('todo'));

    const err = await rejection(rejectInvoice(db, 'uT', { invoiceKey: INVOICE_KEY, reason: 'zu spät' }));

    expect(err.details?.['reason']).toBe('bill-booked');
    expect(store.get(`bills/${BILL_KEY}`)).toMatchObject({ state: 'todo' });
    expect(store.get(`trainer-invoices/${INVOICE_KEY}`)).toMatchObject({ state: 'sent' });
    expect(store.get('work-entries/e1')).toMatchObject({ state: 'invoiced', invoiceKey: INVOICE_KEY });
  });
});

// ---------------------------------------------------------------------------------------------

describe('mirrorBillToInvoice (transaction)', () => {
  const invoice = (state: string, billKey = BILL_KEY): Data => ({ tenants: ['scs'], accountingTenantId: 'scs', state, billKey });
  const bill = (state: string) => ({ trainerInvoiceKey: INVOICE_KEY, state, accountingTenantId: 'scs' });
  const stateAfter = async (stored: Data, billState: string, billId = BILL_KEY): Promise<unknown> => {
    const { db, store } = fakeDb({ [`trainer-invoices/${INVOICE_KEY}`]: stored });
    await mirrorBillToInvoice(db, billId, undefined, bill(billState));
    return (store.get(`trainer-invoices/${INVOICE_KEY}`) as Data)['state'];
  };

  it('mirrors draft → sent and todo → booked', async () => {
    expect(await stateAfter(invoice('booked'), 'draft')).toBe('sent');
    expect(await stateAfter(invoice('sent'), 'todo')).toBe('booked');
  });

  it('never touches a rejected invoice', async () => {
    expect(await stateAfter(invoice('rejected'), 'todo')).toBe('rejected');
  });

  it('ignores a bill whose key the invoice does not link', async () => {
    expect(await stateAfter(invoice('sent', 'ti-other'), 'todo')).toBe('sent');
    expect(await stateAfter(invoice('sent'), 'todo', 'some-other-bill')).toBe('sent');
  });
});
