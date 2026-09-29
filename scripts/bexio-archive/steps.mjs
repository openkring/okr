/**
 * The export steps of scripts/migrate-bexio-archive.mjs (spec 1.68 §4.2). Each step takes
 * ctx = { db, bucket, bexio, tenantId, dry } and returns a counts object. Every write uses a
 * deterministic okey and merge, so a step can be re-run safely.
 */

import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';

import {
  accountOkey, commentImageOkey, commentOkey, fileOkey, filePath, financeDocument, invoicePdfOkey, isoToStoreDate,
  mapBillPayment, mapBillState, mapComment, mapInvoicePayment, mapInvoiceState, mapReminder, reminderPdfOkey, staleIds, toRappen,
} from './mappers.mjs';

export const STEPS = {};

const MAX_STALE = 50;

/** Refuses a destructive apply on a suspicious remote list; a dry run only reports. `--force` overrides. */
function guard({ dry, force }, condition, message) {
  if (condition && !dry && !force) throw new Error(`refusing to apply: ${message} (re-run with --dry to inspect, --force to override)`);
}

/** The subset of `data` that differs from `existing` — so a second run writes nothing. */
export function changes(existing, data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof FieldValue) { if (v.isEqual(FieldValue.delete()) && existing?.[k] !== undefined) out[k] = v; continue; }
    if (JSON.stringify(existing?.[k]) !== JSON.stringify(v)) out[k] = v;
  }
  return out;
}

/** Queues a merge only when something changes. */
function pushChanges(ops, ref, existing, data) {
  const diff = changes(existing, data);
  if (Object.keys(diff).length) ops.push({ ref, data: diff });
}

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
STEPS['journal-reconcile'] = async ({ db, bexio, tenantId, dry, force }) => {
  const ctxFlags = { dry, force };
  const remote = await bexio.getAll('/3.0/accounting/journal');
  if (remote.length === 0) throw new Error('bexio returned an empty journal — refusing to reconcile');
  const local = await localDocs(db, 'bookings', tenantId);
  // only bare numeric okeys come from the bexio sync; bank-/journal-/expense bookings are native
  const stale = new Set(staleIds(local.filter(d => /^\d+$/.test(d.id)).map(d => d.id), remote.map(e => e.id)));
  // remote rows not yet synced locally — the bexio journal sync brings them; must be 0 at the final run
  const missing = staleIds(remote.map(e => e.id), local.map(d => d.id)).length;
  guard(ctxFlags, stale.size > MAX_STALE, `${stale.size} stale bookings (> ${MAX_STALE})`);
  guard(ctxFlags, missing > 0, `${missing} journal rows missing locally — run the bexio journal sync first`);
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
  const periods = new Map((await localDocs(db, 'periods', tenantId)).map(d => [d.id, d.data()]));
  for (const year of years) {
    // no isLocked/lockedBy/lockedAt: a merge must never unlock an already locked year
    const okey = `${tenantId}-${year}`;
    pushChanges(ops, db.collection('periods').doc(okey), periods.get(okey), {
      okey, tenants: [tenantId], isArchived: false, year: Number(year), month: 0, accountingTenantId: tenantId });
  }
  console.log('stale bookings:', [...stale].join(', ') || '—');
  return { remote: remote.length, local: local.length, stale: stale.size, missing, periods: [...years].sort().join(','), writes: await commitOps(db, ops, dry) };
};

/** Deletes local invoices bexio no longer has, re-maps every state (16 partial, 31 unpaid). */
STEPS['invoices-reconcile'] = async ({ db, bexio, tenantId, dry, force }) => {
  const remote = await bexio.getAll('/2.0/kb_invoice');
  if (remote.length === 0) throw new Error('bexio returned an empty invoice list — refusing to reconcile');
  const byId = new Map(remote.map(i => [String(i.id), i]));
  const local = await localDocs(db, 'invoices', tenantId);
  const stale = staleIds(local.filter(d => /^\d+$/.test(d.id)).map(d => d.id), byId.keys());
  guard({ dry, force }, stale.length > MAX_STALE, `${stale.length} stale invoices (> ${MAX_STALE})`);
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
  // not localDocs: three legacy bills lack accountingTenantId and get it here
  const existing = new Map((await db.collection('bills').where('tenants', 'array-contains', tenantId).get()).docs.map(d => [d.id, d.data()]));
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
    pushChanges(ops, db.collection('bills').doc(String(b.id)), existing.get(String(b.id)), data);
  }
  return { remote: list.length, unresolvedVendor: unresolved, writes: await commitOps(db, ops, dry) };
};

/** Read-only: how does a journal row link to its manual entry? (spec §4.2 "verify during implementation") */
STEPS['probe-vouchers'] = async ({ bexio }) => {
  const entries = (await bexio.get('/3.0/accounting/manual_entries', { limit: 30, offset: 0 })) ?? [];
  const journal = await bexio.getAll('/3.0/accounting/journal');
  const journalIds = new Set(journal.map(j => j.id));
  const out = entries.slice(0, 12).map(me => ({
    manualEntryId: me.id, type: me.type,
    lineIds: (me.entries ?? []).map(e => e.id),
    lineIdsInJournal: (me.entries ?? []).filter(e => journalIds.has(e.id)).length,
    journalByRef: journal.filter(j => j.ref_id === me.id).map(j => ({ id: j.id, ref_class: j.ref_class })),
  }));
  const refClasses = {};
  for (const j of journal) refClasses[j.ref_class ?? 'null'] = (refClasses[j.ref_class ?? 'null'] ?? 0) + 1;
  console.log(JSON.stringify({ sample: out, refClasses }, null, 1));
  return { sampled: out.length };
};

/** Every bexio file, downloaded once into the Cloud-Functions-only prefix, plus its finance-documents doc (spec D4). Resumable. */
STEPS['files'] = async ({ db, bucket, bexio, tenantId, dry }) => {
  const files = await bexio.getAll('/3.0/files?archived_state=all');
  let written = 0, skipped = 0, missing = 0, bytes = 0;
  for (const f of files) {
    const ref = db.collection('finance-documents').doc(fileOkey(f.id));
    if ((await ref.get()).exists) { skipped++; continue; }
    if (dry) { written++; bytes += f.size_in_bytes ?? 0; continue; }
    const buf = await bexio.download(f.id);
    if (!buf) { missing++; console.warn('file 404:', f.id); continue; }
    const path = filePath(tenantId, f.uuid, f.extension);
    await bucket.file(path).save(buf, { contentType: f.mime_type || 'application/octet-stream', resumable: false });
    await ref.set(financeDocument({ okey: fileOkey(f.id), tenantId, path, name: f.name ?? String(f.id), mimeType: f.mime_type,
      size: buf.length, hash: createHash('sha256').update(buf).digest('hex'), createdAt: f.created_at }));
    written++; bytes += buf.length;
    if (written % 200 === 0) console.log(`files: ${written} written`);
  }
  return { remote: files.length, written, skipped, missing, megabytes: Math.round(bytes / 1e6) };
};

/**
 * Manual-entry files → booking.documentKeys; bill attachment UUIDs → doc okeys (spec D5, D6).
 * Verified 2026-09-29 (probe-vouchers): a manual-entry line id IS its journal id, i.e. the booking okey.
 * Header files of a (group) entry go on every line's booking. Run `files` first: only docs that exist are linked.
 */
STEPS['link-vouchers'] = async ({ db, bexio, tenantId, dry }) => {
  const downloaded = new Set((await db.collection('finance-documents').get()).docs.map(d => d.id));
  const files = await bexio.getAll('/3.0/files?archived_state=all');
  const okeyByUuid = new Map(files.map(f => [f.uuid, fileOkey(f.id)]));
  const entries = await bexio.getAll('/3.0/accounting/manual_entries');
  const ops = [];
  let missingBooking = 0, notDownloaded = 0, unmappedAttachments = 0, linkedBookings = 0, written = 0;
  for (const me of entries) {
    const headerFiles = (await bexio.get(`/3.0/accounting/manual_entries/${me.id}/files`)) ?? [];
    const keys = new Set(headerFiles.map(f => fileOkey(f.id)));
    for (const line of me.entries ?? []) {
      const lineFiles = (await bexio.get(`/3.0/accounting/manual_entries/${me.id}/entries/${line.id}/files`)) ?? [];
      lineFiles.forEach(f => keys.add(fileOkey(f.id)));
    }
    const documentKeys = [...keys].filter(k => downloaded.has(k) || (notDownloaded++, false)).sort();
    if (documentKeys.length === 0) continue;
    for (const line of me.entries ?? []) {
      const ref = db.collection('bookings').doc(String(line.id));
      if (!(await ref.get()).exists) { missingBooking++; console.warn('no booking for manual entry line', me.id, line.id); continue; }
      pushChanges(ops, ref, (await ref.get()).data(), { documentKeys, documentKey: documentKeys[0] });
      linkedBookings++;
    }
    // commit as we go: ~4.6k bexio calls, one failure must not discard the links made so far
    if (ops.length >= 200) written += await commitOps(db, ops.splice(0), dry);
  }
  for (const b of await localDocs(db, 'bills', tenantId)) {
    const att = b.get('attachments') ?? [];
    if (att.length === 0 || att.every(a => String(a).startsWith('bexio-file-'))) continue;
    const mapped = att.map(a => {
      const k = okeyByUuid.get(a);
      if (!k || !downloaded.has(k)) { unmappedAttachments++; return a; }
      return k;
    });
    pushChanges(ops, b.ref, b.data(), { attachments: mapped });
  }
  written += await commitOps(db, ops, dry);
  return { manualEntries: entries.length, linkedBookings, missingBooking, notDownloaded, unmappedAttachments, writes: written };
};

/** Stores a base64 payload once as a finance-documents doc + private Storage object; returns its okey. */
async function saveBase64({ db, bucket, tenantId, dry }, okey, base64, { name, mimeType, ext, title, createdAt }) {
  const ref = db.collection('finance-documents').doc(okey);
  if (dry || (await ref.get()).exists) return okey;
  const buf = Buffer.from(base64, 'base64');
  const path = `tenant/${tenantId}/private/finance/bexio/${okey}.${ext}`;
  await bucket.file(path).save(buf, { contentType: mimeType, resumable: false });
  await ref.set(financeDocument({ okey, tenantId, path, name: name || okey, mimeType, size: buf.length,
    hash: createHash('sha256').update(buf).digest('hex'), createdAt: createdAt ?? '', title }));
  return okey;
}

/** Per bexio invoice: PDF, reminders (+ PDFs), payments, comments (+ images) — spec D7, D8, Q3. Resumable. */
STEPS['invoice-details'] = async (ctx) => {
  const { db, bexio, tenantId, dry } = ctx;
  const bankAccounts = (await bexio.get('/3.0/banking/accounts')) ?? [];
  const bankMap = new Map(bankAccounts.map(a => [String(a.id), a.account_id ? accountOkey(tenantId, a.account_id) : '']));
  const counts = { invoices: 0, pdfs: 0, reminders: 0, payments: 0, comments: 0 };
  for (const d of await localDocs(db, 'invoices', tenantId)) {
    if (!/^\d+$/.test(d.id)) continue;                          // bexio invoices only
    const id = d.id;
    const nr = d.get('invoiceId') ?? id;
    const update = {};
    const pdf = await bexio.get(`/2.0/kb_invoice/${id}/pdf`);
    if (pdf?.content) {
      update.documentKey = await saveBase64(ctx, invoicePdfOkey(id), pdf.content, { name: pdf.name, mimeType: 'application/pdf', ext: 'pdf', title: nr });
      counts.pdfs++;
    }
    update.reminders = [];
    for (const r of (await bexio.get(`/2.0/kb_invoice/${id}/kb_reminder`)) ?? []) {
      const rpdf = await bexio.get(`/2.0/kb_invoice/${id}/kb_reminder/${r.id}/pdf`);
      const key = rpdf?.content
        ? await saveBase64(ctx, reminderPdfOkey(id, r.id), rpdf.content, { name: rpdf.name, mimeType: 'application/pdf', ext: 'pdf', title: `${nr} Mahnung ${r.reminder_level}` })
        : '';
      update.reminders.push(mapReminder(r, key));
      counts.reminders++;
    }
    const payments = (await bexio.get(`/2.0/kb_invoice/${id}/payment`)) ?? [];
    update.payments = payments.map(p => mapInvoicePayment(p, tenantId, bankMap)).sort((a, b) => a.date.localeCompare(b.date));
    if (update.payments.length) update.paymentDate = update.payments.at(-1).date;
    counts.payments += payments.length;
    for (const c of (await bexio.get(`/2.0/kb_invoice/${id}/comment`)) ?? []) {
      const attachmentKeys = [];
      if (c.image) {
        const m = /^data:([^;]+);base64,(.*)$/s.exec(c.image);
        const mimeType = m ? m[1] : 'image/png';
        attachmentKeys.push(await saveBase64(ctx, commentImageOkey(c.id), m ? m[2] : c.image,
          { mimeType, ext: mimeType.split('/')[1] ?? 'png', createdAt: c.date }));
      }
      if (!dry) await db.collection('finance-comments').doc(commentOkey(c.id)).set(mapComment(c, id, tenantId, attachmentKeys));
      counts.comments++;
    }
    if (!dry) await d.ref.set(update, { merge: true });
    counts.invoices++;
    if (counts.invoices % 100 === 0) console.log(`invoice-details: ${counts.invoices} invoices`);
  }
  return counts;
};

/** Outgoing payments per bill → payments[] + paymentDate (latest execution date). */
STEPS['bill-payments'] = async ({ db, bexio, tenantId, dry }) => {
  const ops = [];
  let payments = 0, foreignPayments = 0, bills = 0;
  for (const b of await localDocs(db, 'bills', tenantId)) {
    if (!/^\d+$/.test(b.id)) continue;                          // bexio bills only
    bills++;
    const r = await bexio.get('/4.0/purchase/outgoing-payments', { bill_id: b.id, limit: 100, page: 1 });
    // do not trust the filter blindly: a payment naming another bill is dropped and counted
    const own = (r?.data ?? []).filter(p => p.bill_id == null || String(p.bill_id) === b.id || (foreignPayments++, false));
    const list = own.map(mapBillPayment).sort((x, y) => x.date.localeCompare(y.date));
    payments += list.length;
    pushChanges(ops, b.ref, b.data(), { payments: list, paymentDate: list.at(-1)?.date ?? '' });
  }
  return { bills, payments, foreignPayments, writes: await commitOps(db, ops, dry) };
};
