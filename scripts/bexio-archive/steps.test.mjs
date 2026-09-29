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
  const counts = await STEPS['journal-reconcile']({ db, bexio: bexioWith({ '/3.0/accounting/journal': [{ id: 1 }] }), tenantId: 'scs', dry: true });
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
  const counts = await STEPS['invoices-reconcile']({ db, bexio: bexioWith({ '/2.0/kb_invoice': [{ id: 99, kb_item_status_id: 9 }] }), tenantId: 'scs', dry: false });
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

function fakeBucket() {
  const saved = new Map();
  return { saved, file: (path) => ({ save: async (buf, opt) => saved.set(path, { buf, opt }) }) };
}

test('files downloads each file once into the private prefix and skips existing docs', async () => {
  const db = fakeFirestore({ 'finance-documents': { 'bexio-file-2': { okey: 'bexio-file-2' } } });
  const bucket = fakeBucket();
  const downloads = [];
  const bexio = {
    ...bexioWith({ '/3.0/files?archived_state=all': [
      { id: 1, uuid: 'u-1', name: 'beleg.pdf', extension: 'pdf', mime_type: 'application/pdf', size_in_bytes: 3, created_at: '2025-01-02 10:00:00' },
      { id: 2, uuid: 'u-2', name: 'alt.pdf', extension: 'pdf', mime_type: 'application/pdf' },
    ] }),
    download: async (id) => { downloads.push(id); return Buffer.from('pdf'); },
  };
  const counts = await STEPS['files']({ db, bucket, bexio, tenantId: 'scs', dry: false });
  assert.deepEqual(downloads, [1]);
  assert.deepEqual([counts.written, counts.skipped], [1, 1]);
  assert.equal(bucket.saved.has('tenant/scs/private/finance/bexio/u-1.pdf'), true);
  const doc = db.store.get('finance-documents/bexio-file-1');
  assert.equal(doc.fullPath, 'tenant/scs/private/finance/bexio/u-1.pdf');
  assert.equal(doc.type, 'finance');
  assert.equal(doc.dateOfDocCreation, '20250102');
  assert.equal(doc.hash.length, 64);
});

test('link-vouchers puts header and line files on the booking, maps bill uuids, counts missing bookings', async () => {
  const db = fakeFirestore({
    bookings: { '59': { ...T }, '64': { ...T }, '65': { ...T } },
    bills: { '5': { ...T, attachments: ['u-9', 'u-unknown'] }, '6': { ...T, attachments: ['bexio-file-9'] } },
    'finance-documents': { 'bexio-file-3': {}, 'bexio-file-4': {}, 'bexio-file-7': {}, 'bexio-file-9': {} },
  });
  const bexio = bexioWith({
    '/3.0/files?archived_state=all': [{ id: 9, uuid: 'u-9' }],
    '/3.0/accounting/manual_entries': [
      { id: 1, entries: [{ id: 59 }] },
      { id: 6, entries: [{ id: 64 }, { id: 65 }] },
      { id: 8, entries: [{ id: 99 }] },
    ],
    '/3.0/accounting/manual_entries/1/files': [{ id: 7 }],
    '/3.0/accounting/manual_entries/1/entries/59/files': [{ id: 3 }, { id: 7 }],
    '/3.0/accounting/manual_entries/6/entries/65/files': [{ id: 4 }],
    '/3.0/accounting/manual_entries/8/files': [{ id: 4 }],
  });
  const counts = await STEPS['link-vouchers']({ db, bexio, tenantId: 'scs', dry: false });
  assert.deepEqual(db.store.get('bookings/59').documentKeys, ['bexio-file-3', 'bexio-file-7']);
  assert.equal(db.store.get('bookings/59').documentKey, 'bexio-file-3');
  assert.deepEqual(db.store.get('bookings/64').documentKeys, ['bexio-file-4']);   // group entry: shared by all its lines
  assert.deepEqual(db.store.get('bookings/65').documentKeys, ['bexio-file-4']);
  assert.equal(counts.missingBooking, 1);                                          // entry 8 → booking 99 absent
  assert.deepEqual(db.store.get('bills/5').attachments, ['bexio-file-9', 'u-unknown']);
  assert.equal(counts.unmappedAttachments, 1);
  assert.deepEqual(db.store.get('bills/6').attachments, ['bexio-file-9']);
});

test('link-vouchers never links a doc that was not downloaded', async () => {
  const db = fakeFirestore({ bookings: { '59': { ...T } } });
  const bexio = bexioWith({
    '/3.0/accounting/manual_entries': [{ id: 1, entries: [{ id: 59 }] }],
    '/3.0/accounting/manual_entries/1/files': [{ id: 7 }],
  });
  const counts = await STEPS['link-vouchers']({ db, bexio, tenantId: 'scs', dry: false });
  assert.equal(db.store.get('bookings/59').documentKeys, undefined);
  assert.equal(counts.notDownloaded, 1);
});

test('invoice-details stores PDFs, reminders, payments and internal comments', async () => {
  const db = fakeFirestore({ invoices: { '2097': { ...T, invoiceId: 'RE-2097', paymentDate: '' }, 'native1': { ...T } } });
  const bucket = fakeBucket();
  const b64 = Buffer.from('pdf').toString('base64');
  const bexio = bexioWith({
    '/3.0/banking/accounts': [{ id: 3, account_id: 21 }],
    '/2.0/kb_invoice/2097/pdf': { name: 'RE-2097.pdf', content: b64 },
    '/2.0/kb_invoice/2097/kb_reminder': [{ id: 1, reminder_level: 1, is_valid_from: '2026-06-01', is_valid_to: '2026-06-15', is_sent: true }],
    '/2.0/kb_invoice/2097/kb_reminder/1/pdf': { name: 'M1.pdf', content: b64 },
    '/2.0/kb_invoice/2097/payment': [
      { date: '2026-07-02', value: '30.00', bank_account_id: 3 },
      { date: '2026-06-20', value: '50.00', bank_account_id: null },
    ],
    '/2.0/kb_invoice/2097/comment': [{ id: 9, text: 'Rest folgt', user_name: 'Kassier', date: '2026-06-21 09:00:00', is_public: true,
      image: 'data:image/jpeg;base64,' + b64 }],
  });
  const counts = await STEPS['invoice-details']({ db, bucket, bexio, tenantId: 'scs', dry: false });
  const inv = db.store.get('invoices/2097');
  assert.equal(inv.documentKey, 'bexio-invoice-2097');
  assert.equal(db.store.get('finance-documents/bexio-invoice-2097').fullPath, 'tenant/scs/private/finance/bexio/bexio-invoice-2097.pdf');
  assert.deepEqual(inv.reminders, [{ level: 1, date: '20260601', dueDate: '20260615', isSent: true, documentKey: 'bexio-reminder-2097-1' }]);
  assert.deepEqual(inv.payments.map(p => [p.date, p.amount, p.bankAccountKey]), [['20260620', 5000, ''], ['20260702', 3000, 'scs0021']]);
  assert.equal(inv.paymentDate, '20260702');
  const c = db.store.get('finance-comments/bexio-comment-9');
  assert.equal(c.parentKey, 'invoice.2097');
  // `image` is the comment author's bexio avatar (2 distinct PNGs on 644 comments, 2026-09-29), not an attachment
  assert.deepEqual(c.attachmentKeys, []);
  assert.equal(db.store.has('finance-documents/bexio-comment-image-9'), false);
  assert.equal(db.store.has('invoices/native1') && db.store.get('invoices/native1').documentKey, undefined);   // native invoice untouched
  assert.deepEqual([counts.invoices, counts.pdfs, counts.reminders, counts.payments, counts.comments], [1, 1, 1, 2, 1]);
});

test('invoice-details keeps an existing paymentDate when bexio lists no payment', async () => {
  const db = fakeFirestore({ invoices: { '5': { ...T, paymentDate: '20250101' } } });
  await STEPS['invoice-details']({ db, bucket: fakeBucket(), bexio: bexioWith({}), tenantId: 'scs', dry: false });
  assert.equal(db.store.get('invoices/5').paymentDate, '20250101');
});

test('invoice-details dry run writes nothing', async () => {
  const db = fakeFirestore({ invoices: { '5': { ...T } } });
  const bucket = fakeBucket();
  await STEPS['invoice-details']({ db, bucket, bexio: bexioWith({ '/2.0/kb_invoice/5/comment': [{ id: 1, text: 'x' }] }), tenantId: 'scs', dry: true });
  assert.deepEqual(db.store.get('invoices/5'), { ...T });
  assert.equal(db.store.has('finance-comments/bexio-comment-1'), false);
  assert.equal(bucket.saved.size, 0);
});

test('bill-payments sets payments and the latest execution date', async () => {
  const B5 = '00000000-0000-4000-8000-000000000005', B6 = '00000000-0000-4000-8000-000000000006';
  const db = fakeFirestore({ bills: { [B5]: { ...T }, [B6]: { ...T, paymentDate: '' } } });
  const bexio = { get: async (path, params) => path === '/4.0/purchase/outgoing-payments' && params.bill_id === B5
    ? { data: [{ execution_date: '2025-03-01', amount: 10, payment_type: 'QR' }, { execution_date: '2025-02-01', amount: 5, payment_type: 'MANUAL' }] }
    : { data: [] } };
  const counts = await STEPS['bill-payments']({ db, bexio, tenantId: 'scs', dry: false });
  assert.deepEqual(db.store.get(`bills/${B5}`).payments.map(p => p.date), ['20250201', '20250301']);
  assert.equal(db.store.get(`bills/${B5}`).paymentDate, '20250301');
  assert.deepEqual(db.store.get(`bills/${B6}`).payments, []);
  assert.equal(counts.payments, 2);
});

// ── review fix pass ────────────────────────────────────────────────────────────
test('journal-reconcile refuses to delete when bexio returns an empty journal', async () => {
  const db = fakeFirestore({ bookings: { '1': { ...T, date: '20250105' } } });
  await assert.rejects(STEPS['journal-reconcile']({ db, bexio: bexioWith({}), tenantId: 'scs', dry: false }), /empty/);
  assert.equal(db.store.has('bookings/1'), true);
});

test('journal-reconcile refuses to delete more than 50 or with unsynced rows, unless forced', async () => {
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [String(i + 10), { ...T, date: '20250105' }]));
  const db = fakeFirestore({ bookings: { '1': { ...T, date: '20250105' }, ...many } });
  const bx = bexioWith({ '/3.0/accounting/journal': [{ id: 1 }] });
  await assert.rejects(STEPS['journal-reconcile']({ db, bexio: bx, tenantId: 'scs', dry: false }), /stale/);
  assert.equal(db.store.has('bookings/10'), true);
  const db2 = fakeFirestore({ bookings: { '1': { ...T, date: '20250105' } } });
  const bx2 = bexioWith({ '/3.0/accounting/journal': [{ id: 1 }, { id: 2 }] });
  await assert.rejects(STEPS['journal-reconcile']({ db: db2, bexio: bx2, tenantId: 'scs', dry: false }), /missing/);
  const counts = await STEPS['journal-reconcile']({ db: db2, bexio: bx2, tenantId: 'scs', dry: false, force: true });
  assert.equal(counts.missing, 1);
});

test('a dry run never throws on the guards — it reports', async () => {
  const db = fakeFirestore({ bookings: { '1': { ...T, date: '20250105' } } });
  const counts = await STEPS['journal-reconcile']({ db, bexio: bexioWith({ '/3.0/accounting/journal': [{ id: 1 }, { id: 2 }] }), tenantId: 'scs', dry: true });
  assert.equal(counts.missing, 1);
});

test('invoices-reconcile refuses an empty invoice list', async () => {
  const db = fakeFirestore({ invoices: { '10': { ...T } } });
  await assert.rejects(STEPS['invoices-reconcile']({ db, bexio: bexioWith({}), tenantId: 'scs', dry: false }), /empty/);
});

test('second runs write nothing (journal periods, bills-full, link-vouchers, bill-payments)', async () => {
  const UB = '00000000-0000-4000-8000-0000000000b5';
  const db = fakeFirestore({
    bookings: { '59': { ...T, date: '20250105' } },
    bills: { [UB]: { ...T, attachments: ['u-9'] } },
    orgs: { o1: { name: 'Muster AG', bexioId: '77' } },
    'finance-documents': { 'bexio-file-9': {} },
  });
  const bexio = {
    ...bexioWith({
      '/3.0/accounting/journal': [{ id: 59 }],
      '/4.0/purchase/bills': [{ id: UB, document_no: 'LR-5', title: null, status: 'PAID', gross: '1', bill_date: '2025-02-01', due_date: null, booking_account_ids: [1] }],
      [`/4.0/purchase/bills/${UB}`]: { supplier_id: 77 },
      '/3.0/files?archived_state=all': [{ id: 9, uuid: 'u-9' }],
      '/3.0/accounting/manual_entries': [{ id: 1, entries: [{ id: 59 }] }],
      '/3.0/accounting/manual_entries/1/files': [{ id: 9 }],
    }),
  };
  const bp = { get: async () => ({ data: [{ execution_date: '2025-03-01', amount: 1, payment_type: 'QR' }] }) };
  const first = await STEPS['bill-payments']({ db, bexio: bp, tenantId: 'scs', dry: true });
  assert.equal(first.writes, 1, 'bill-payments must see the bexio bill');
  for (const step of ['journal-reconcile', 'bills-full', 'link-vouchers']) await STEPS[step]({ db, bexio, tenantId: 'scs', dry: false });
  await STEPS['bill-payments']({ db, bexio: bp, tenantId: 'scs', dry: false });
  for (const step of ['journal-reconcile', 'bills-full', 'link-vouchers']) {
    assert.equal((await STEPS[step]({ db, bexio, tenantId: 'scs', dry: true })).writes, 0, step);
  }
  assert.equal((await STEPS['bill-payments']({ db, bexio: bp, tenantId: 'scs', dry: true })).writes, 0, 'bill-payments');
});

test('bill-payments drops payments of another bill and skips native bills', async () => {
  const U = '0b3f6a1e-8c2d-4e5f-9a7b-1c2d3e4f5a6b';            // bexio v4 bill ids are UUIDs
  const db = fakeFirestore({ bills: { [U]: { ...T }, 'nat1': { ...T } } });
  const calls = [];
  const bexio = { get: async (path, params) => { calls.push(params.bill_id); return { data: [
    { bill_id: U, execution_date: '2025-03-01', amount: 1, payment_type: 'QR' },
    { bill_id: 'aaaaaaaa-8c2d-4e5f-9a7b-1c2d3e4f5a6b', execution_date: '2025-04-01', amount: 2, payment_type: 'QR' },
  ] }; } };
  const counts = await STEPS['bill-payments']({ db, bexio, tenantId: 'scs', dry: false });
  assert.deepEqual(calls, [U]);
  assert.equal(db.store.get(`bills/${U}`).payments.length, 1);
  assert.equal(counts.foreignPayments, 1);
  assert.equal(counts.bills, 1);
});

test('link-vouchers commits in chunks so a later failure keeps earlier links', async () => {
  const entries = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, entries: [{ id: 1000 + i }] }));
  const seed = { bookings: Object.fromEntries(entries.map(e => [String(e.entries[0].id), { ...T }])), 'finance-documents': { 'bexio-file-9': {} } };
  const db = fakeFirestore(seed);
  const bexio = {
    getAll: async (p) => p === '/3.0/accounting/manual_entries' ? entries : [],
    get: async (p) => {
      if (p === '/3.0/accounting/manual_entries/250/files') throw new Error('bexio 500');
      return /\/manual_entries\/\d+\/files$/.test(p) ? [{ id: 9 }] : [];
    },
  };
  await assert.rejects(STEPS['link-vouchers']({ db, bexio, tenantId: 'scs', dry: false }), /500/);
  assert.deepEqual(db.store.get('bookings/1000').documentKeys, ['bexio-file-9']);
});

test('invoice-details resumes without re-fetching stored PDFs', async () => {
  const db = fakeFirestore({
    invoices: { '7': { ...T } },
    'finance-documents': { 'bexio-invoice-7': {}, 'bexio-reminder-7-1': {} },
  });
  const fetched = [];
  const bexio = { get: async (p) => { fetched.push(p); return p.endsWith('/kb_reminder') ? [{ id: 1, reminder_level: 1 }] : null; } };
  await STEPS['invoice-details']({ db, bucket: fakeBucket(), bexio, tenantId: 'scs', dry: false });
  assert.equal(fetched.some(p => p.endsWith('/pdf')), false);
  assert.equal(db.store.get('invoices/7').documentKey, 'bexio-invoice-7');
  assert.equal(db.store.get('invoices/7').reminders[0].documentKey, 'bexio-reminder-7-1');
});

test('invoice-details logs a PDF that keeps failing and carries on', async () => {
  const db = fakeFirestore({ invoices: { '8': { ...T }, '9': { ...T } } });
  const b64 = Buffer.from('pdf').toString('base64');
  const bexio = { get: async (p) => {
    if (p === '/2.0/kb_invoice/8/pdf') throw new Error('bexio 500 on /2.0/kb_invoice/8/pdf');
    if (p === '/2.0/kb_invoice/9/pdf') return { name: '9.pdf', content: b64 };
    return null;
  } };
  const counts = await STEPS['invoice-details']({ db, bucket: fakeBucket(), bexio, tenantId: 'scs', dry: false });
  assert.deepEqual(counts.pdfErrors, ['8']);
  assert.equal(db.store.get('invoices/9').documentKey, 'bexio-invoice-9');
  assert.equal(db.store.get('invoices/8').documentKey, undefined);
  assert.equal(counts.invoices, 2);
});

test('cleanup-comment-images removes the avatar copies and their references', async () => {
  const db = fakeFirestore({
    'finance-documents': { 'bexio-comment-image-9': { fullPath: 'p/9.png' }, 'bexio-file-1': { fullPath: 'p/1.pdf' } },
    'finance-comments': { 'bexio-comment-9': { attachmentKeys: ['bexio-comment-image-9'] } },
  });
  const deleted = [];
  const bucket = { file: (p) => ({ delete: async () => deleted.push(p) }) };
  const counts = await STEPS['cleanup-comment-images']({ db, bucket, tenantId: 'scs', dry: false });
  assert.deepEqual(deleted, ['p/9.png']);
  assert.equal(db.store.has('finance-documents/bexio-comment-image-9'), false);
  assert.equal(db.store.has('finance-documents/bexio-file-1'), true);
  assert.deepEqual(db.store.get('finance-comments/bexio-comment-9').attachmentKeys, []);
  assert.deepEqual([counts.images, counts.comments], [1, 1]);
});
