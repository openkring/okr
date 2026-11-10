import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, Firestore, Transaction } from 'firebase-admin/firestore';

import {
  AvatarInfo, FinanceDocumentCollection, InvoiceBillingKind, InvoiceCollection, InvoiceModel, InvoicePositionCollection, InvoicePositionModel,
} from '@okr/shared-models';
import { getInvoiceIndex, getNextInvoiceNo } from '@okr/finance-invoice-util';
import {
  addDuration, DateFormat, generateQrReference, generateRandomString, getTodayStr, isMoneyPosition, isRebatePosition, removeKeyFromOkrModel,
} from '@okr/shared-util-core';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { isBexioBackend } from '../bexio/backend-gate';
import { assertPeriodsOpen } from '../booking/period-lock';
import { allocateBookingNo } from '../booking/booking-no';
import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { privateBucket } from '../_storage/private-bucket';
import { renderDocument } from '../pdf/render-document';
import { writeFinanceHistory } from '../finance-history/finance-history';
import {
  buildInvoicePayload, finalizeDecision, invoiceBookingIndex, invoiceBookingLines, issueBlockers, issueHeaderBlockers, issueOutcome,
  issuePeriodKeys, PositionInput, sortPositions, totalRappen, withoutUndefined,
} from './invoice.logic';
import { assertLeafAccount, loadOwnedAccountingConfig, receiverAddress, receiverGender, refuse, treasurerContact } from './invoice-context';

/**
 * Server-side cores of writing a draft invoice and issuing it (spec 1.76 phase 1), without the callable
 * shells, so server code (top-up and monthly invoices, plan 1.149) can create and issue invoices too.
 * The callers own authentication and roles; `tenantId` is the tenant that owns the invoice, `actor` the
 * uid (or a label like 'stripe') used for the finance history and the render log.
 */

const LOG = 'issueInvoice';
const ACCOUNTING_CONFIG_COLLECTION = 'accounting-configs';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;
const MAX_POSITION_NAME_LENGTH = 200;
const MAX_POSITION_DESCRIPTION_LENGTH = 500;

type InvoiceDoc = Record<string, unknown>;
type Receiver = { key?: string; name1?: string; name2?: string; modelType?: string } | undefined;

export interface IssueInvoiceResult {
  invoiceNo: number;
  documentKey: string;
  bookingKey: string;
}

// ---------------------------------------------------------------------------------------------------
// draft
// ---------------------------------------------------------------------------------------------------

/** The receiver as stored on the invoice: every AvatarInfo field a string. */
export function cleanReceiver(r: unknown): InvoiceModel['receiver'] {
  if (r === undefined || r === null) return undefined;
  if (typeof r !== 'object') throw new HttpsError('invalid-argument', 'receiver must be an object');
  const o = r as Record<string, unknown>;
  const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
  return {
    key: str(o['key']), name1: str(o['name1']), name2: str(o['name2']),
    modelType: str(o['modelType']) as AvatarInfo['modelType'],
    type: str(o['type']), subType: str(o['subType']), label: str(o['label']),
  };
}

/** Header fields of a draft; an absent field keeps the stored value (`receiver` is replaced when the key is present). */
export interface DraftHeader {
  title?: string;
  invoiceDate?: string;
  dueDate?: string;
  receiver?: InvoiceModel['receiver'];
  notes?: string;
  billingKind?: InvoiceBillingKind;
}

/** Inside the draft transaction (a read, so before any write): the books exist, list `tenantId` and are booked here, not in bexio. */
export async function assertDraftBooks(db: Firestore, tx: Transaction, tenantId: string, accountingTenantId: string | undefined): Promise<void> {
  if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
  const configSnap = await tx.get(db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId));
  if (!configSnap.exists) throw refuse('no-accounting-config', `no accounting config for ${accountingTenantId}`);
  const config = configSnap.data();
  if (!((config?.['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw refuse('foreign-accounting-tenant', `${accountingTenantId} does not belong to this tenant`);
  }
  if (isBexioBackend(config)) {
    throw refuse('bexio-backend', `${accountingTenantId} is booked in bexio — invoices are not written here`);
  }
}

/**
 * The writes of a draft (after all reads of the transaction): the invoice header in state `draft` with
 * its total and index, and one position doc per input position. The caller deletes old positions.
 */
export function writeDraft(db: Firestore, tx: Transaction, d: {
  tenantId: string; invoiceKey: string; existing: InvoiceDoc | undefined; accountingTenantId: string; header: DraftHeader; positions: PositionInput[];
}): void {
  const { tenantId, invoiceKey, existing, header: h, positions } = d;
  const invoice = new InvoiceModel(tenantId);
  if (existing) Object.assign(invoice, existing);
  invoice.tenants = (existing?.['tenants'] as string[] | undefined) ?? [tenantId];
  invoice.accountingTenantId = d.accountingTenantId;
  if (h.title !== undefined) invoice.title = String(h.title).slice(0, MAX_TITLE_LENGTH);
  if (h.invoiceDate !== undefined) invoice.invoiceDate = h.invoiceDate;
  if (h.dueDate !== undefined) invoice.dueDate = h.dueDate;
  if ('receiver' in h) invoice.receiver = h.receiver;
  if (h.notes !== undefined) invoice.notes = h.notes.slice(0, MAX_NOTES_LENGTH);
  if (h.billingKind !== undefined) invoice.billingKind = h.billingKind;
  invoice.state = 'draft';
  invoice.invoiceNo = 0;
  invoice.invoiceId = '';
  invoice.totalAmount = { amount: totalRappen(positions), currency: 'CHF', periodicity: 'one-time' };
  invoice.index = getInvoiceIndex(invoice);
  tx.set(db.collection(InvoiceCollection).doc(invoiceKey), withoutUndefined(removeKeyFromOkrModel(invoice)));

  positions.forEach((p, index) => {
    const position = new InvoicePositionModel(tenantId);
    const money = isMoneyPosition(p);
    position.tenants = invoice.tenants;
    position.invoiceKey = invoiceKey;
    position.invoicePositionType = p.type || 'fix';
    position.sortOrder = index; // the editor's order (spec 1.84 K3)
    position.name = String(p.name ?? '').slice(0, MAX_POSITION_NAME_LENGTH);
    position.description = String(p.description ?? '').slice(0, MAX_POSITION_DESCRIPTION_LENGTH);
    // layout lines carry no amount and no account, whatever the client sent (spec 1.84 K2)
    position.amount = money ? p.amount : 0;
    position.currency = 'CHF';
    position.accountKey = money ? String(p.accountKey ?? '') : '';
    position.discountPercent = isRebatePosition(p) ? Math.min(100, Math.max(0, Number(p.discountPercent) || 0)) : 0;
    position.isBillable = money;
    tx.set(db.collection(InvoicePositionCollection).doc(generateRandomString(20)), withoutUndefined(removeKeyFromOkrModel(position)));
  });
}

// ---------------------------------------------------------------------------------------------------
// issue
// ---------------------------------------------------------------------------------------------------

function storedResult(invoice: InvoiceDoc): IssueInvoiceResult {
  return {
    invoiceNo: Number(invoice['invoiceNo'] ?? 0),
    documentKey: String(invoice['documentKey'] ?? ''),
    bookingKey: String(invoice['bookingKey'] ?? ''),
  };
}

export async function readPositions(db: Firestore, invoiceKey: string): Promise<PositionInput[]> {
  const snap = await db.collection(InvoicePositionCollection).where('invoiceKey', '==', invoiceKey).get();
  return sortPositions(snap.docs
    .map((d) => d.data())
    .filter((p) => p['isArchived'] !== true)
    .map((p): PositionInput => ({
      type: String(p['invoicePositionType'] ?? '') || 'fix',
      name: String(p['name'] ?? ''),
      amount: typeof p['amount'] === 'number' ? p['amount'] : Number.NaN,
      accountKey: String(p['accountKey'] ?? ''),
      description: String(p['description'] ?? ''),
      discountPercent: Number(p['discountPercent'] ?? 0),
      ...(typeof p['sortOrder'] === 'number' ? { sortOrder: p['sortOrder'] } : {}),
    })));
}

/** Every reason this invoice cannot be issued (empty = it can). */
function blockersOf(invoice: InvoiceDoc, positions: PositionInput[], receivablesKey: string, templateId: string): string[] {
  return [
    ...issueBlockers(positions, receivablesKey),
    ...issueHeaderBlockers({
      receiverKey: (invoice['receiver'] as Receiver)?.key,
      invoiceDate: invoice['invoiceDate'] as string | undefined,
      dueDate: invoice['dueDate'] as string | undefined,
      invoiceTemplateId: templateId,
    }),
  ];
}

interface Preflight {
  receivablesKey: string;
  templateId: string;
  fiscalYearStart: number;
}

/**
 * Steps 2 and 3, before a number is taken: the config allows issuing here, nothing blocks the draft,
 * its accounts are leaves and its period is open. The final transaction re-checks accounts and period.
 */
async function checkIssuable(db: Firestore, tenantId: string, invoiceKey: string, pre: InvoiceDoc): Promise<Preflight> {
  const accountingTenantId = String(pre['accountingTenantId'] ?? '');
  const config = await loadOwnedAccountingConfig(db, tenantId, invoiceKey, accountingTenantId);
  const receivablesKey = String(config['receivablesAccountKey'] ?? '');
  // the books' default template: neither the callable nor the server cores choose another one
  const templateId = String(config['invoiceTemplateId'] ?? '');
  const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;

  const prePositions = await readPositions(db, invoiceKey);
  const blockers = blockersOf(pre, prePositions, receivablesKey, templateId);
  if (blockers.length > 0) {
    throw refuse('issue-blocked', `invoice ${invoiceKey} cannot be issued: ${blockers.join(', ')}`, { reasons: blockers });
  }
  // layout lines and a spread discount carry no account (spec 1.84)
  for (const key of [...new Set([receivablesKey, ...prePositions.map((p) => p.accountKey).filter((k) => k.trim())])]) {
    await assertLeafAccount(db, accountingTenantId, key);
  }
  await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, String(pre['invoiceDate'] ?? ''), fiscalYearStart));
  return { receivablesKey, templateId, fiscalYearStart };
}

/**
 * Issue a draft invoice (spec 1.76, phase 1): assign the number, render the PDF into the private
 * bucket, register it as a finance-document, post the Debitoren booking and set the invoice pending.
 *
 * Idempotent and resumable. The number is assigned in a first transaction that moves the draft to the
 * transient state `issuing` (writeInvoice refuses non-drafts, so header and positions are frozen from
 * then on). The slow render follows; every id after it is deterministic (`invoice-{key}`), so a run
 * that finds `issuing` keeps the stored number and run nonce (`issueRunId`) and overwrites. The final
 * transaction only writes while state, number and nonce are still this run's (`finalizeDecision`). The final transaction writes the
 * finance-document, the booking with its lines and the `pending` state atomically. A call on an
 * issued invoice (double click, retried call) returns the stored result and writes nothing.
 *
 * Renders a PDF with Puppeteer: the calling function needs the memory of issueInvoice (1 GiB).
 */
export async function issueDraftInvoice(db: Firestore, input: { tenantId: string; invoiceKey: string; actor: string }): Promise<IssueInvoiceResult> {
  const { tenantId, invoiceKey, actor: uid } = input;
  const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);

  // ---- 1. the invoice, the tenant, the state ----
  const pre = (await invoiceRef.get()).data();
  if (!pre) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
  if (!((pre['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
  }
  const preOutcome = issueOutcome(String(pre['state'] ?? ''));
  if (preOutcome === 'already-issued') return storedResult(pre);
  if (preOutcome === 'refuse') throw refuse('not-issuable', `invoice ${invoiceKey} is ${String(pre['state'])}`);

  // ---- 2./3. config, positions, blockers, accounts, period lock (before a number is assigned) ----
  const accountingTenantId = String(pre['accountingTenantId'] ?? '');
  let preflight: Preflight;
  try {
    preflight = await checkIssuable(db, tenantId, invoiceKey, pre);
  } catch (e) {
    // A resumed `issuing` invoice that now fails a check gives its number back (step 8) — only on a
    // real refusal (locked period, blocker, config), never on a transient error (network, quota).
    if (pre['state'] === 'issuing' && e instanceof HttpsError && e.code === 'failed-precondition') {
      await resetToDraft(db, invoiceKey, `invoice-${invoiceKey}`, Number(pre['invoiceNo'] ?? 0), String(pre['issueRunId'] ?? ''));
    }
    throw e;
  }
  const { receivablesKey, templateId, fiscalYearStart } = preflight;

  // ---- 4. number: draft → issuing (an `issuing` invoice keeps its number and adopts its run nonce) ----
  const numbered = await db.runTransaction(async (tx) => {
    const invoice = (await tx.get(invoiceRef)).data();
    if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
    const state = String(invoice['state'] ?? '');
    const outcome = issueOutcome(state);
    if (outcome === 'already-issued') return { done: true as const, invoice };
    if (outcome === 'refuse') throw refuse('not-issuable', `invoice ${invoiceKey} is ${state}`);
    if (state === 'issuing') return { done: false as const, invoice };

    const invoiceDate = String(invoice['invoiceDate'] ?? '');
    if (!/^\d{8}$/.test(invoiceDate)) throw refuse('issue-blocked', 'no invoice date', { reasons: ['no-invoice-date'] });
    const all = await tx.get(db.collection(InvoiceCollection).where('accountingTenantId', '==', accountingTenantId));
    const nos = all.docs.map((d) => Number(d.data()['invoiceNo'] ?? 0)).filter((n) => Number.isInteger(n) && n > 0);
    const invoiceNo = getNextInvoiceNo(nos, Number(invoiceDate.substring(0, 4)));
    // issueRunId (R10): a per-run nonce, so a stale run can never finalize an invoice that was reset and
    // issued again meanwhile — even under the same number. Transient: removed on pending and on reset.
    const patch = { invoiceNo, invoiceId: String(invoiceNo), paymentReference: generateQrReference(invoiceNo), state: 'issuing', issueRunId: generateRandomString(20) };
    tx.update(invoiceRef, patch);
    return { done: false as const, invoice: { ...invoice, ...patch } };
  });
  if (numbered.done) return storedResult(numbered.invoice);

  const invoice = numbered.invoice;
  const invoiceNo = Number(invoice['invoiceNo'] ?? 0);
  const invoiceId = String(invoice['invoiceId'] ?? '');
  const runId = String(invoice['issueRunId'] ?? '');
  const documentKey = `invoice-${invoiceKey}`;
  const bookingKey = `invoice-${invoiceKey}`;
  let committed = false;

  try {
    if (!Number.isInteger(invoiceNo) || invoiceNo <= 0 || !invoiceId) {
      throw refuse('inconsistent-state', `invoice ${invoiceKey} is issuing without a number`);
    }
    // Header and positions are frozen now (writeInvoice refuses non-drafts): re-read and re-check
    // them, the pre-checks above ran on a snapshot a concurrent edit may have changed.
    const positions = await readPositions(db, invoiceKey);
    const blockers = blockersOf(invoice, positions, receivablesKey, templateId);
    if (blockers.length > 0) {
      throw refuse('issue-blocked', `invoice ${invoiceKey} cannot be issued: ${blockers.join(', ')}`, { reasons: blockers });
    }
    const invoiceDate = String(invoice['invoiceDate']);
    const periodKeys = issuePeriodKeys(accountingTenantId, invoiceDate, fiscalYearStart);
    const receiver = invoice['receiver'] as Receiver;
    const title = String(invoice['title'] ?? '').trim() || `Rechnung ${invoiceId}`;

    // ---- 5./6. address and PDF (slow, idempotent: deterministic path) ----
    const address = await receiverAddress(db, receiver, tenantId);
    const gender = await receiverGender(db, receiver);
    const filename = `${invoiceId}.pdf`;
    const fullPath = `tenant/${tenantId}/private/finance/invoices/${invoiceKey}.pdf`;
    const rendered = await renderDocument({
      templateId,
      payload: {
        ...buildInvoicePayload({
          invoiceId,
          title,
          invoiceDate,
          dueDate: String(invoice['dueDate'] ?? ''),
          receiver: { name1: receiver?.name1 ?? '', name2: receiver?.name2 ?? '', modelType: receiver?.modelType ?? '' },
          positions,
          address,
          gender,
        }),
        contact: await treasurerContact(db, tenantId, getTodayStr(DateFormat.StoreDate)),
        invoiceKey,
      },
      options: { outputFormat: 'pdf', filename },
    }, uid, tenantId, { bucket: privateBucket(), path: fullPath });

    // ---- 7. finance-document, booking, lines, pending — atomically ----
    const tenants = (invoice['tenants'] as string[] | undefined) ?? [tenantId];
    const lines = invoiceBookingLines(positions, receivablesKey);
    // Kostenstellen (spec 1.65): plain reads before the transaction, account default per line
    const ccCtx = await loadCostCenterContext(db, tenantId, accountingTenantId, lines.map((l) => l.accountKey));
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);
    const result = await db.runTransaction(async (tx) => {
      // reads (all before any write)
      const current = (await tx.get(invoiceRef)).data();
      if (!current) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
      const bookingExists = (await tx.get(bookingRef)).exists;
      const decision = finalizeDecision(
        {
          state: String(current['state'] ?? ''),
          invoiceNo: Number(current['invoiceNo'] ?? 0),
          issueRunId: String(current['issueRunId'] ?? ''),
        },
        { expectedInvoiceNo: invoiceNo, expectedRunId: runId, bookingExists },
      );
      if (decision === 'return-stored') return storedResult(current); // a concurrent run won: write nothing
      if (decision === 'refuse') throw refuse('state-changed', `invoice ${invoiceKey} changed while it was issued`);
      await assertPeriodsOpen(db, periodKeys, tx);
      // layout lines and a spread discount carry no account (spec 1.84)
      for (const key of [...new Set([receivablesKey, ...positions.map((p) => p.accountKey).filter((k) => k.trim())])]) {
        await assertLeafAccount(db, accountingTenantId, key, tx);
      }
      let bookingNo = 0;
      if (decision === 'write') {
        bookingNo = await allocateBookingNo(db, tx, accountingTenantId, Number(invoiceDate.substring(0, 4)));
      }

      // writes
      const today = getTodayStr(DateFormat.StoreDate);
      tx.set(db.collection(FinanceDocumentCollection).doc(documentKey), withoutUndefined({
        tenants, accountingTenantId, isArchived: false,
        index: `n:${filename}`, tags: 'invoice', folderKeys: [], fullPath, description: '', title: filename,
        altText: filename, type: 'finance', source: 'storage', credit: '', url: '', mimeType: 'application/pdf',
        size: rendered.sizeBytes, authorKey: '', authorName: '', dateOfDocCreation: today,
        dateOfDocLastUpdate: today, locationKey: '', hash: '', priorVersionKey: '', version: '', renderings: [],
      }));
      if (decision === 'write') {
        tx.set(bookingRef, withoutUndefined({
          tenants, accountingTenantId, isArchived: false,
          title, date: invoiceDate, notes: '', tags: 'invoice', index: invoiceBookingIndex(invoiceDate, bookingNo, title, invoiceId),
          bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, invoiceDate, fiscalYearStart),
          documentKey, documentKeys: [documentKey], counterparty: receiver,
        }));
        lines.forEach((line, i) => {
          const costCenterKey = costCenterKeyForLine(ccCtx, line.accountKey, { explicit: '' });
          tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-${i}`), withoutUndefined({
            tenants, accountingTenantId, isArchived: false, bookingKey, accountKey: line.accountKey,
            ...(costCenterKey ? { costCenterKey } : {}),
            ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
            ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
          }));
        });
      }
      // the search index was built while the draft had no number: rebuild it with the invoice number
      const index = getInvoiceIndex({ ...current, invoiceId } as unknown as InvoiceModel);
      tx.update(invoiceRef, { state: 'pending', index, documentKey, bookingKey, issueRunId: FieldValue.delete() });
      return { invoiceNo, documentKey, bookingKey };
    });
    committed = true;
    await writeFinanceHistory(db, { tenantId, uid, parentKey: `invoice.${invoiceKey}`, kind: 'issued', details: invoiceId });
    logger.info(`${LOG}: issued ${invoiceKey} as ${invoiceId} (tenant=${tenantId})`);
    return result;
  } catch (e) {
    if (!committed) await resetToDraft(db, invoiceKey, bookingKey, invoiceNo, runId);
    throw e;
  }
}

/**
 * Best effort after a failed issue: give the number back, but only while the invoice is still
 * `issuing` with this number and run nonce and no booking was committed — never touch a pending invoice.
 */
async function resetToDraft(db: Firestore, invoiceKey: string, bookingKey: string, invoiceNo: number, runId: string): Promise<void> {
  const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);
  try {
    await db.runTransaction(async (tx) => {
      const invoice = (await tx.get(invoiceRef)).data();
      const booking = await tx.get(db.collection(BOOKING_COLLECTION).doc(bookingKey));
      // a concurrent run may have reset and re-numbered it: only release our own number and run
      if (invoice?.['state'] !== 'issuing' || Number(invoice['invoiceNo']) !== invoiceNo) return;
      if (String(invoice['issueRunId'] ?? '') !== runId || booking.exists) return;
      tx.update(invoiceRef, { state: 'draft', invoiceNo: 0, invoiceId: '', paymentReference: '', issueRunId: FieldValue.delete() });
    });
  } catch (e) {
    logger.error(`${LOG}: could not reset ${invoiceKey} to draft`, e);
  }
}

// ---------------------------------------------------------------------------------------------------
// create and issue
// ---------------------------------------------------------------------------------------------------

export interface CreateAndIssueInvoiceInput {
  okey: string;               // the invoice key: the idempotency key of the whole call
  tenantId: string;           // the tenant that owns the invoice (operator tenant for platform billing)
  accountingTenantId: string; // the books
  receiver: AvatarInfo;
  title: string;
  billingKind: '' | 'subscription' | 'topup';
  /** Amount 0 = an information line (a `text` position: no amount, no account, no booking), e.g. «settled from credit». */
  positions: Array<{ title: string; amount: number /* Rappen */; accountKey: string }>;
  dueDays: number;
  actor: string;
}

/** The fields in which a stored invoice differs from a createAndIssueInvoice input: books, billing kind, total (Rappen). */
export function okeyMismatch(existing: InvoiceDoc, input: Pick<CreateAndIssueInvoiceInput, 'accountingTenantId' | 'billingKind' | 'positions'>): string[] {
  const fields: string[] = [];
  if (String(existing['accountingTenantId'] ?? '') !== input.accountingTenantId) fields.push('accountingTenantId');
  if (String(existing['billingKind'] ?? '') !== input.billingKind) fields.push('billingKind');
  const total = input.positions.reduce((sum, p) => sum + p.amount, 0);
  if (Number((existing['totalAmount'] as { amount?: number } | undefined)?.amount ?? Number.NaN) !== total) fields.push('totalAmount');
  return fields;
}

/**
 * Create a draft invoice with its positions in the given books and issue it (number, QR reference,
 * booking, PDF). Idempotent on `okey`: an issued invoice returns its key and number without writing; a
 * draft (or a run interrupted while `issuing`) is issued as stored, the input is not written again. An
 * existing invoice whose books, billing kind or total differ from the input is refused (`okey-mismatch`).
 * Invoice date is today; the due date is today + `dueDays`. The PDF uses the books' default template.
 */
export async function createAndIssueInvoice(db: Firestore, input: CreateAndIssueInvoiceInput): Promise<{ invoiceKey: string; invoiceNo: number }> {
  const { okey, tenantId, accountingTenantId, actor } = input;
  if (typeof okey !== 'string' || !okey.trim()) throw new HttpsError('invalid-argument', 'okey is required');
  if (!Number.isInteger(input.dueDays) || input.dueDays < 0) throw new HttpsError('invalid-argument', 'dueDays must be a whole number of days, 0 or more');
  if (!Array.isArray(input.positions) || input.positions.length === 0) throw new HttpsError('invalid-argument', 'positions are required');
  if (input.positions.some((p) => !Number.isInteger(p.amount) || p.amount < 0) || !input.positions.some((p) => p.amount > 0)) {
    throw new HttpsError('invalid-argument', 'every position needs a positive amount in Rappen (0 = an information line), at least one above 0');
  }
  const invoiceRef = db.collection(InvoiceCollection).doc(okey);
  const invoiceDate = getTodayStr(DateFormat.StoreDate);
  const header: DraftHeader = {
    title: input.title,
    invoiceDate,
    dueDate: addDuration(invoiceDate, { days: input.dueDays }),
    receiver: cleanReceiver(input.receiver),
    notes: '',
    billingKind: input.billingKind,
  };
  const positions: PositionInput[] = input.positions.map((p) => (p.amount === 0
    ? { type: 'text', name: p.title, amount: 0, accountKey: '', description: '' }
    : { type: 'fix', name: p.title, amount: p.amount / 100, accountKey: p.accountKey, description: '' }));

  await db.runTransaction(async (tx) => {
    const existing = (await tx.get(invoiceRef)).data();
    if (existing) {
      if (!((existing['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
      }
      // the same okey must mean the same invoice: never issue or return a different one under this key
      const mismatch = okeyMismatch(existing, input);
      if (mismatch.length > 0) {
        throw refuse('okey-mismatch', `invoice ${okey} exists with a different ${mismatch.join(', ')}`, { fields: mismatch });
      }
      return; // already written: the issue step below decides (issued → stored result, draft → issue)
    }
    await assertDraftBooks(db, tx, tenantId, accountingTenantId);
    writeDraft(db, tx, { tenantId, invoiceKey: okey, existing: undefined, accountingTenantId, header, positions });
  });

  const { invoiceNo } = await issueDraftInvoice(db, { tenantId, invoiceKey: okey, actor });
  return { invoiceKey: okey, invoiceNo };
}
