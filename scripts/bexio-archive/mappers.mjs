/** Pure bexio → okr mappers for scripts/migrate-bexio-archive.mjs (spec 1.68). No I/O. */

/** bexio date or datetime ('2026-09-28', '2026-09-28T10:11:12+02:00', '2026-09-28 10:11:12') → StoreDate. */
export function isoToStoreDate(iso) {
  if (!iso) return '';
  return String(iso).substring(0, 10).replaceAll('-', '');
}

export function toRappen(value) {
  if (value === null || value === undefined || value === '') return 0;
  return Math.round(parseFloat(String(value)) * 100);
}

/** Same okey scheme as the bexio account sync (apps/functions/src/bexio/account.ts). */
export function accountOkey(tenantId, bexioAccountId) {
  return `${tenantId}${String(bexioAccountId).padStart(4, '0')}`;
}

const INVOICE_STATES = { 7: 'draft', 8: 'pending', 9: 'paid', 16: 'partial', 19: 'cancelled', 31: 'unpaid' };
export function mapInvoiceState(statusId) {
  return INVOICE_STATES[statusId] ?? String(statusId);
}

/** Keep in step with mapBillState in apps/functions/src/bexio/bill.mapper.ts. */
export function mapBillState(status, overdue) {
  if (status === 'PAID') return 'paid';
  if (status === 'DRAFT') return 'draft';
  return overdue ? 'overdue' : 'todo';
}

export const fileOkey = (fileId) => `bexio-file-${fileId}`;
export const invoicePdfOkey = (invoiceId) => `bexio-invoice-${invoiceId}`;
export const reminderPdfOkey = (invoiceId, reminderId) => `bexio-reminder-${invoiceId}-${reminderId}`;
export const commentOkey = (commentId) => `bexio-comment-${commentId}`;
export const commentImageOkey = (commentId) => `bexio-comment-image-${commentId}`;

/** Under the Cloud-Functions-only Storage prefix tenant/{tid}/private/**. */
export function filePath(tenantId, uuid, extension) {
  const ext = (extension ?? '').toLowerCase().replace(/^\./, '');
  return `tenant/${tenantId}/private/finance/bexio/${uuid}${ext ? '.' + ext : ''}`;
}

export function mapInvoicePayment(p, tenantId, bankAccountMap) {
  const bankKey = p.bank_account_id == null ? '' : (bankAccountMap.get(String(p.bank_account_id)) ?? '');
  return { date: isoToStoreDate(p.date), amount: toRappen(p.value), bankAccountKey: bankKey, bookingKey: '' };
}

export function mapReminder(r, documentKey) {
  return {
    level: Number(r.reminder_level) || 0,
    date: isoToStoreDate(r.is_valid_from),
    dueDate: isoToStoreDate(r.is_valid_to),
    isSent: r.is_sent === true,
    documentKey,
    fee: 0,
    bookingKey: '',
    waivedAt: '',
    waiveBookingKey: '',
  };
}

/**
 * A reminder created in okr (createInvoiceReminder, spec 1.76 phase 3), not archived from bexio: it
 * carries a fee booking, or a document key outside the archive's `bexio-` namespace
 * (native: `invoice-{key}-reminder-{level}`). Archived ones have bookingKey '' and a `bexio-` key or ''.
 */
export function isNativeReminder(r) {
  const documentKey = String(r?.documentKey ?? '');
  return !!r?.bookingKey || (documentKey !== '' && !documentKey.startsWith('bexio-'));
}

/**
 * The reminders to store on a re-run: the freshly archived bexio ones plus every native reminder the
 * invoice already carries. A native reminder wins its level (an archived one of the same level is
 * skipped); the result is ordered by level, oldest first.
 */
export function mergeArchivedReminders(existing, archived) {
  const native = (existing ?? []).filter(isNativeReminder);
  const nativeLevels = new Set(native.map(r => r.level));
  return [...archived.filter(r => !nativeLevels.has(r.level)), ...native].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
}

/**
 * True for the okey of a synced bexio journal row (bexio's numeric journal id, e.g. '12054'). okr's
 * own booking keys never are (`invoice-…`, `bank-…`, `journal-…`). A payment linked to such a row
 * by scripts/link-bexio-ledger.mjs is still an archived bexio payment, not one recorded in okr.
 */
export function isBexioJournalKey(key) {
  return typeof key === 'string' && /^\d+$/.test(key);
}

/** A payment recorded in okr since the migration: it carries an okr booking key. */
function isNativePayment(p) {
  return typeof p?.bookingKey === 'string' && p.bookingKey !== '' && !isBexioJournalKey(p.bookingKey);
}

/**
 * Archived payments keep the bexio journal link an existing payment of the same date and amount
 * (and bank account, when both name one) already carries, so a re-run does not drop the links of
 * scripts/link-bexio-ledger.mjs. Each existing link is used once.
 */
function keepLedgerLinks(existing, archived) {
  const linked = (existing ?? []).filter(p => isBexioJournalKey(p?.bookingKey));
  return archived.map(a => {
    const i = linked.findIndex(p => p.date === a.date && p.amount === a.amount
      && (!p.bankAccountKey || !a.bankAccountKey || p.bankAccountKey === a.bankAccountKey));
    if (i < 0) return a;
    const [match] = linked.splice(i, 1);
    return { ...a, bookingKey: match.bookingKey };
  });
}

/**
 * The payments to store on a re-run: the archived bexio payments (with their bexio journal links)
 * plus every payment recorded in okr since the migration (recordInvoicePayment sets an okr
 * bookingKey; archived bexio payments carry '' or a bexio journal id), oldest first. Without this a
 * re-run would wipe native payments and leave their bookings orphaned.
 */
export function mergeArchivedPayments(existing, archived) {
  const native = (existing ?? []).filter(isNativePayment);
  return [...keepLedgerLinks(existing, archived), ...native].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** The bill payments to store on a re-run: bexio's list, with the journal links already made. */
export function mergeArchivedBillPayments(existing, archived) {
  return keepLedgerLinks(existing, archived);
}

/** True when okr has recorded payments or reminders on this invoice since the migration (bexio no longer knows its state). */
export function hasNativeActivity(data) {
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const reminders = Array.isArray(data?.reminders) ? data.reminders : [];
  return payments.some(isNativePayment) || reminders.some(isNativeReminder);
}

/** CommentModel shape (libs/shared/models/src/lib/comment.model.ts). All bexio comments are internal (spec §5 Q3). */
export function mapComment(c, invoiceOkey, tenantId, attachmentKeys) {
  const dt = String(c.date ?? '').replace(/[^0-9]/g, '').padEnd(14, '0').substring(0, 14);
  return {
    okey: commentOkey(c.id),
    index: '',
    authorKey: '',
    authorName: c.user_name ?? '',
    creationDateTime: dt,
    parentKey: `invoice.${invoiceOkey}`,
    description: c.text ?? '',
    attachmentKeys,
    isArchived: false,
    tags: 'bexio',
    tenants: [tenantId],
  };
}

export function mapBillPayment(p) {
  return { date: isoToStoreDate(p.execution_date), amount: toRappen(p.amount), type: p.payment_type ?? '' };
}

/** DocumentModel shape (libs/shared/models/src/lib/document.model.ts) for finance-documents. */
export function financeDocument({ okey, tenantId, path, name, mimeType, size, hash, createdAt, title }) {
  return {
    okey, tenants: [tenantId], accountingTenantId: tenantId, isArchived: false,
    index: `n:${name}`, tags: 'bexio', folderKeys: [], fullPath: path, description: '', title: title ?? name,
    altText: name, type: 'finance', source: 'storage', credit: '', url: '', mimeType: mimeType ?? '',
    size: size ?? 0, authorKey: '', authorName: '', dateOfDocCreation: isoToStoreDate(createdAt),
    dateOfDocLastUpdate: isoToStoreDate(createdAt), locationKey: '', hash: hash ?? '',
    priorVersionKey: '', version: '', renderings: [],
  };
}

/** The stale ids that may be deleted: not those whose local doc carries okr activity (payments or reminders recorded in okr). */
export function deletableStale(localDocs, remoteIds) {
  const stale = staleIds(localDocs.filter(d => /^\d+$/.test(d.id)).map(d => d.id), remoteIds);
  const byId = new Map(localDocs.map(d => [d.id, d]));
  const deletable = stale.filter(id => !hasNativeActivity(byId.get(id)?.data() ?? {}));
  return { deletable, skipped: stale.filter(id => !deletable.includes(id)) };
}

export function staleIds(localIds, remoteIds) {
  const remote = new Set([...remoteIds].map(String));
  return [...localIds].map(String).filter(id => !remote.has(id));
}

/**
 * CHF amount of a journal row plus, for a foreign-currency row, its original amount.
 * Port of journalLineAmounts in apps/functions/src/bexio/journal.mapper.ts — keep the two in step.
 */
export function journalLineAmounts(entry, currencyCodes) {
  const chf = { amount: toRappen(entry.base_currency_amount ?? entry.amount), currency: 'CHF', periodicity: 'one-time' };
  const isFx = entry.currency_id != null && entry.base_currency_id != null && entry.currency_id !== entry.base_currency_id;
  const fx = isFx
    ? { amount: toRappen(entry.amount), currency: currencyCodes.get(entry.currency_id) ?? String(entry.currency_id), periodicity: 'one-time' }
    : null;
  return { chf, fx };
}
