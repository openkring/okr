import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitOps } from './steps.mjs';

function fakeDb() {
  const commits = [];
  return {
    commits,
    batch() {
      const ops = [];
      return { set: (ref, data, opt) => ops.push(['set', ref, data, opt]), delete: (ref) => ops.push(['del', ref]), commit: async () => commits.push(ops) };
    },
  };
}

test('commitOps chunks by 400 and merges sets', async () => {
  const db = fakeDb();
  const ops = Array.from({ length: 401 }, (_, i) => ({ ref: `r${i}`, data: { i } }));
  ops.push({ ref: 'gone', del: true });
  assert.equal(await commitOps(db, ops, false), 402);
  assert.deepEqual(db.commits.map(c => c.length), [400, 2]);
  assert.deepEqual(db.commits[0][0], ['set', 'r0', { i: 0 }, { merge: true }]);
  assert.deepEqual(db.commits[1][1], ['del', 'gone']);
});

test('commitOps in dry mode writes nothing', async () => {
  const db = fakeDb();
  assert.equal(await commitOps(db, [{ ref: 'a', data: {} }], true), 1);
  assert.equal(db.commits.length, 0);
});

import { STEPS } from './steps.mjs';
import { fakeFirestore } from './fake-firestore.mjs';

const T = { tenants: ['scs'], accountingTenantId: 'scs' };
const bexioWith = (routes) => ({
  getAll: async (path) => routes[path] ?? [],
  getV4All: async (path) => routes[path] ?? [],
  get: async (path) => routes[path] ?? null,
});

test('journal-reconcile deletes stale bexio bookings with both lines, keeps native ones, sets periods', async () => {
  const db = fakeFirestore({
    bookings: {
      '1': { ...T, date: '20250105' }, '2': { ...T, date: '20260110' },
      'bank-x': { ...T, date: '20260201' }, '9': { tenants: ['scs'], accountingTenantId: 'gss', date: '20260101' },
    },
    'booking-lines': { '2-dr': T, '2-cr': T, '1-dr': T },
  });
  const counts = await STEPS['journal-reconcile']({ db, bexio: bexioWith({ '/3.0/accounting/journal': [{ id: 1 }] }), tenantId: 'scs', dry: false });
  assert.equal(counts.stale, 1);
  assert.equal(db.store.has('bookings/2'), false);
  assert.equal(db.store.has('booking-lines/2-dr'), false);
  assert.equal(db.store.has('booking-lines/2-cr'), false);
  assert.equal(db.store.has('bookings/bank-x'), true);          // native booking, not a bexio id
  assert.equal(db.store.has('bookings/9'), true);               // gss books untouched
  assert.equal(db.store.get('bookings/1').periodKey, 'scs-2025');
  assert.equal(db.store.get('bookings/bank-x').periodKey, 'scs-2026');
  assert.equal(db.store.get('periods/scs-2025').year, 2025);
  assert.equal(db.store.get('periods/scs-2026').month, 0);
  assert.equal(db.store.has('periods/scs-2027'), false);
});

test('journal-reconcile never unlocks a locked period', async () => {
  const db = fakeFirestore({ bookings: { '1': { ...T, date: '20250105' } }, periods: { 'scs-2025': { ...T, year: 2025, isLocked: true } } });
  await STEPS['journal-reconcile']({ db, bexio: bexioWith({ '/3.0/accounting/journal': [{ id: 1 }] }), tenantId: 'scs', dry: false });
  assert.equal(db.store.get('periods/scs-2025').isLocked, true);
});

test('journal-reconcile dry run writes nothing', async () => {
  const db = fakeFirestore({ bookings: { '2': { ...T, date: '20260110' } } });
  const counts = await STEPS['journal-reconcile']({ db, bexio: bexioWith({}), tenantId: 'scs', dry: true });
  assert.equal(counts.stale, 1);
  assert.equal(db.store.has('bookings/2'), true);
});

test('invoices-reconcile deletes stale invoices and maps partial/unpaid', async () => {
  const db = fakeFirestore({ invoices: { '10': { ...T, state: '16' }, '11': { ...T, state: 'draft' }, '12': { ...T, state: 'paid' } } });
  const remote = [{ id: 10, kb_item_status_id: 16 }, { id: 12, kb_item_status_id: 9 }];
  const counts = await STEPS['invoices-reconcile']({ db, bexio: bexioWith({ '/2.0/kb_invoice': remote }), tenantId: 'scs', dry: false });
  assert.equal(counts.stale, 1);
  assert.equal(db.store.has('invoices/11'), false);
  assert.equal(db.store.get('invoices/10').state, 'partial');
  assert.equal(counts.writes, 2);                               // one delete + one state change; 12 unchanged
});

test('invoices-reconcile never deletes a native invoice', async () => {
  const db = fakeFirestore({ invoices: { 'AbC123xyz': { ...T, state: 'pending' } } });
  const counts = await STEPS['invoices-reconcile']({ db, bexio: bexioWith({ '/2.0/kb_invoice': [] }), tenantId: 'scs', dry: false });
  assert.equal(counts.stale, 0);
  assert.equal(db.store.has('invoices/AbC123xyz'), true);
});

test('bills-full resolves the vendor and maps state and accounts', async () => {
  const db = fakeFirestore({
    orgs: { o1: { name: 'Muster AG', bexioId: '077' } },
    bills: { '5': { tenants: ['scs'], bexioVender: 'Muster AG', state: 'booked', attachments: ['u-1'] } },
  });
  const bexio = bexioWith({
    '/4.0/purchase/bills': [
      { id: 5, document_no: 'LR-5', title: null, status: 'PAID', gross: '99.95', bill_date: '2025-02-01', due_date: '2025-03-01', booking_account_ids: [256] },
      { id: 6, document_no: 'LR-6', title: 'Strom', status: 'FAILED', overdue: true, gross: '10', bill_date: null, due_date: null, booking_account_ids: [] },
    ],
    '/4.0/purchase/bills/5': { supplier_id: 77 },
    '/4.0/purchase/bills/6': { supplier_id: 88 },
  });
  const counts = await STEPS['bills-full']({ db, bexio, tenantId: 'scs', dry: false });
  assert.equal(counts.unresolvedVendor, 1);
  const b5 = db.store.get('bills/5');
  assert.equal(b5.state, 'paid');
  assert.equal(b5.vendor.key, 'o1');
  assert.equal(b5.bookingAccount, 'scs0256');
  assert.equal(b5.accountingTenantId, 'scs');
  assert.deepEqual(b5.attachments, ['u-1']);                    // left for link-vouchers
  assert.equal(b5.totalAmount.amount, 9995);
  assert.equal(db.store.get('bills/6').state, 'overdue');
  assert.equal(db.store.get('bills/6').notes, 'bexio supplier 88');
});
