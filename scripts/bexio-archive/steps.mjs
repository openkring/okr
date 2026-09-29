/**
 * The export steps of scripts/migrate-bexio-archive.mjs (spec 1.68 §4.2). Each step takes
 * ctx = { db, bucket, bexio, tenantId, dry } and returns a counts object. Every write uses a
 * deterministic okey and merge, so a step can be re-run safely.
 */

import { FieldValue } from 'firebase-admin/firestore';

import {
  accountOkey, isoToStoreDate, mapBillState, mapInvoiceState, staleIds, toRappen,
} from './mappers.mjs';

export const STEPS = {};

/** Finance docs of the accounting tenant (both tenancy fields, as every finance query must). */
export async function localDocs(db, collection, tenantId) {
  const snap = await db.collection(collection)
    .where('tenants', 'array-contains', tenantId).where('accountingTenantId', '==', tenantId).get();
  return snap.docs;
}

/** Commits writes in chunks of 400; in dry mode only counts. `ops` = [{ ref, data?, del? }]. */
export async function commitOps(db, ops, dry) {
  if (dry) return ops.length;
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) {
      if (op.del) batch.delete(op.ref); else batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
  }
  return ops.length;
}

/**
 * bexio contact id → AvatarInfo of the okr person/org carrying that `bexioId`.
 * Port of loadReceiverMap in apps/functions/src/bexio/invoice.ts — keep the two in step.
 */
export async function loadReceiverMap(db) {
  const map = new Map();
  const normalize = (bexioId) => {
    const raw = (bexioId ?? '').toString().trim();
    const n = parseInt(raw, 10);
    return raw && !Number.isNaN(n) ? String(n) : undefined;
  };
  const [persons, orgs] = await Promise.all([db.collection('persons').get(), db.collection('orgs').get()]);
  for (const d of persons.docs) {
    const key = normalize(d.data().bexioId);
    if (!key) continue;
    const firstName = d.data().firstName ?? '';
    const lastName = d.data().lastName ?? '';
    map.set(key, { key: d.id, name1: firstName, name2: lastName, modelType: 'person', type: '', subType: '',
      label: [firstName, lastName].filter(Boolean).join(' ') });
  }
  for (const d of orgs.docs) {
    const key = normalize(d.data().bexioId);
    if (!key) continue;
    const name = d.data().name ?? '';
    map.set(key, { key: d.id, name1: '', name2: name, modelType: 'org', type: d.data().type ?? '', subType: '', label: name });
  }
  return map;
}

/** Deletes local bookings bexio no longer has (+ both lines), creates annual periods, sets periodKey (spec D3, D12). */
STEPS['journal-reconcile'] = async ({ db, bexio, tenantId, dry }) => {
  const remote = await bexio.getAll('/3.0/accounting/journal');
  const local = await localDocs(db, 'bookings', tenantId);
  // only bare numeric okeys come from the bexio sync; bank-/journal-/expense bookings are native
  const stale = new Set(staleIds(local.filter(d => /^\d+$/.test(d.id)).map(d => d.id), remote.map(e => e.id)));
  const ops = [];
  for (const id of stale) {
    ops.push({ ref: db.collection('bookings').doc(id), del: true });
    ops.push({ ref: db.collection('booking-lines').doc(`${id}-dr`), del: true });
    ops.push({ ref: db.collection('booking-lines').doc(`${id}-cr`), del: true });
  }
  const years = new Set();
  for (const d of local) {
    if (stale.has(d.id)) continue;
    const year = String(d.get('date') ?? '').substring(0, 4);
    if (!/^\d{4}$/.test(year)) continue;
    years.add(year);
    const periodKey = `${tenantId}-${year}`;
    if (d.get('periodKey') !== periodKey) ops.push({ ref: d.ref, data: { periodKey } });
  }
  for (const year of years) {
    // no isLocked/lockedBy/lockedAt: a merge must never unlock an already locked year
    ops.push({ ref: db.collection('periods').doc(`${tenantId}-${year}`), data: {
      okey: `${tenantId}-${year}`, tenants: [tenantId], isArchived: false, year: Number(year), month: 0,
      accountingTenantId: tenantId } });
  }
  console.log('stale bookings:', [...stale].join(', ') || '—');
  // remote rows not yet synced locally — the bexio journal sync brings them; must be 0 at the final run
  const missing = staleIds(remote.map(e => e.id), local.map(d => d.id)).length;
  return { remote: remote.length, local: local.length, stale: stale.size, missing, periods: [...years].sort().join(','), writes: await commitOps(db, ops, dry) };
};

/** Deletes local invoices bexio no longer has, re-maps every state (16 partial, 31 unpaid). */
STEPS['invoices-reconcile'] = async ({ db, bexio, tenantId, dry }) => {
  const remote = await bexio.getAll('/2.0/kb_invoice');
  const byId = new Map(remote.map(i => [String(i.id), i]));
  const local = await localDocs(db, 'invoices', tenantId);
  const stale = staleIds(local.filter(d => /^\d+$/.test(d.id)).map(d => d.id), byId.keys());
  const ops = stale.map(id => ({ ref: db.collection('invoices').doc(id), del: true }));
  for (const d of local) {
    const inv = byId.get(d.id);
    if (!inv) continue;
    const state = mapInvoiceState(inv.kb_item_status_id);
    if (d.get('state') !== state) ops.push({ ref: d.ref, data: { state } });
  }
  console.log('stale invoices:', stale.join(', ') || '—');
  return { remote: remote.length, local: local.length, stale: stale.length, writes: await commitOps(db, ops, dry) };
};

/** Every bill with its detail: state, vendor, booking accounts as okeys (spec D6). `attachments` → link-vouchers. */
STEPS['bills-full'] = async ({ db, bexio, tenantId, dry }) => {
  const list = await bexio.getV4All('/4.0/purchase/bills', { bill_date_start: '2000-01-01' });
  const receivers = await loadReceiverMap(db);
  const ops = [];
  let unresolved = 0;
  for (const b of list) {
    const detail = (await bexio.get(`/4.0/purchase/bills/${b.id}`)) ?? {};
    const vendor = detail.supplier_id != null ? receivers.get(String(detail.supplier_id)) : undefined;
    const data = {
      tenants: [tenantId], accountingTenantId: tenantId, isArchived: false,
      title: b.title ?? b.document_no, billId: b.document_no,
      billDate: isoToStoreDate(b.bill_date), dueDate: isoToStoreDate(b.due_date),
      totalAmount: { amount: toRappen(b.gross), currency: b.currency_code ?? 'CHF', periodicity: 'one-time' },
      state: mapBillState(b.status, b.overdue),
      bookingAccount: (b.booking_account_ids ?? []).map(id => accountOkey(tenantId, id)).join(','),
      bexioVender: FieldValue.delete(),
    };
    if (vendor) data.vendor = vendor;
    else { unresolved++; data.notes = `bexio supplier ${detail.supplier_id ?? '?'}`; }
    ops.push({ ref: db.collection('bills').doc(String(b.id)), data });
  }
  return { remote: list.length, unresolvedVendor: unresolved, writes: await commitOps(db, ops, dry) };
};
