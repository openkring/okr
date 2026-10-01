import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

import { AddressCollection, AddressModel, FinanceDocumentCollection, InvoiceCollection, InvoicePositionCollection } from '@okr/shared-models';
import { getNextInvoiceNo } from '@okr/finance-invoice-util';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import {
  checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, nextBookingNo, pickFavoriteByChannel, scopeToTenant,
} from '@okr/shared-util-functions';

import { isBexioBackend } from '../bexio/backend-gate';
import { periodKeyFor } from '../bank-import/bank-import.util';
import { assertPeriodsOpen, touchedPeriodKeys } from '../booking/period-lock';
import { privateBucket } from '../_storage/private-bucket';
import { renderDocument } from '../pdf/render-document';
import {
  buildInvoicePayload, invoiceBookingLines, issueBlockers, issueHeaderBlockers, issueOutcome, PositionInput, PostalAddress,
  withoutUndefined,
} from './invoice.logic';

const REGION = 'europe-west6';
const CF_NAME = 'issueInvoice';
const ACCOUNTING_CONFIG_COLLECTION = 'accounting-configs';
const ACCOUNT_COLLECTION = 'accounts';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';

interface IssueInvoiceData {
  invoiceKey?: string;
}

interface IssueInvoiceResult {
  invoiceNo: number;
  documentKey: string;
  bookingKey: string;
}

type InvoiceDoc = Record<string, unknown>;
type Receiver = { key?: string; name1?: string; name2?: string; modelType?: string } | undefined;

function refuse(reason: string, message: string, extra: Record<string, unknown> = {}): HttpsError {
  return new HttpsError('failed-precondition', message, { reason, ...extra });
}

function storedResult(invoice: InvoiceDoc): IssueInvoiceResult {
  return {
    invoiceNo: Number(invoice['invoiceNo'] ?? 0),
    documentKey: String(invoice['documentKey'] ?? ''),
    bookingKey: String(invoice['bookingKey'] ?? ''),
  };
}

async function readPositions(db: Firestore, invoiceKey: string): Promise<PositionInput[]> {
  const snap = await db.collection(InvoicePositionCollection).where('invoiceKey', '==', invoiceKey).get();
  return snap.docs
    .map((d) => d.data())
    .filter((p) => p['isArchived'] !== true)
    .map((p) => ({
      name: String(p['name'] ?? ''),
      amount: typeof p['amount'] === 'number' ? p['amount'] : Number.NaN,
      accountKey: String(p['accountKey'] ?? ''),
      description: String(p['description'] ?? ''),
    }));
}

/** Every reason this invoice cannot be issued (empty = it can). */
function blockersOf(invoice: InvoiceDoc, positions: PositionInput[], receivablesKey: string, templateId: string): string[] {
  return [
    ...issueBlockers(positions, receivablesKey),
    ...issueHeaderBlockers({
      receiverKey: (invoice['receiver'] as Receiver)?.key,
      invoiceDate: invoice['invoiceDate'] as string | undefined,
      invoiceTemplateId: templateId,
    }),
  ];
}

/** The account exists, belongs to this accounting tenant and is a leaf (same rule as postBankImport). */
async function assertLeafAccount(db: Firestore, accountingTenantId: string, accountKey: string): Promise<void> {
  const account = (await db.collection(ACCOUNT_COLLECTION).doc(accountKey).get()).data();
  const children = await db.collection(ACCOUNT_COLLECTION).where('parentKey', '==', accountKey).limit(1).get();
  if (!account || account['accountingTenantId'] !== accountingTenantId || !children.empty) {
    throw refuse('account-invalid', `account ${accountKey} is not a leaf account of ${accountingTenantId}`, { accountKey });
  }
}

/** The receiver's favourite postal address collected by this tenant (D-L1), or undefined. */
async function receiverAddress(db: Firestore, receiver: Receiver, tenantId: string): Promise<PostalAddress | undefined> {
  if (!receiver?.key || !receiver.modelType) return undefined;
  const snap = await db.collection(AddressCollection).where('parentKey', '==', `${receiver.modelType}.${receiver.key}`).get();
  const addresses = scopeToTenant(snap.docs.map((d) => ({ ...d.data(), okey: d.id }) as AddressModel), tenantId);
  const postal = pickFavoriteByChannel(addresses, 'postal');
  if (!postal) return undefined;
  return {
    streetName: postal.streetName ?? '',
    streetNumber: postal.streetNumber ?? '',
    zipCode: postal.zipCode ?? '',
    city: postal.city ?? '',
    countryCode: postal.countryCode || 'CH',
  };
}

interface Preflight {
  receivablesKey: string;
  templateId: string;
  fiscalYearStart: number;
  prePositions: PositionInput[];
}

/** Steps 2 and 3: the config allows issuing here, nothing blocks the draft, its accounts are leaves, its period is open. */
async function checkIssuable(db: Firestore, tenantId: string, invoiceKey: string, pre: InvoiceDoc): Promise<Preflight> {
  const accountingTenantId = String(pre['accountingTenantId'] ?? '');
  if (!accountingTenantId) throw refuse('no-accounting-config', `invoice ${invoiceKey} has no accounting tenant`);
  const config = (await db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId).get()).data();
  if (!config) throw refuse('no-accounting-config', `no accounting config for ${accountingTenantId}`);
  if (!((config['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw refuse('foreign-accounting-tenant', `${accountingTenantId} does not belong to this tenant`);
  }
  if (isBexioBackend(config)) {
    throw refuse('bexio-backend', `${accountingTenantId} is booked in bexio — invoices are not issued here`);
  }
  const receivablesKey = String(config['receivablesAccountKey'] ?? '');
  const templateId = String(config['invoiceTemplateId'] ?? '');
  const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;

  const prePositions = await readPositions(db, invoiceKey);
  const blockers = blockersOf(pre, prePositions, receivablesKey, templateId);
  if (blockers.length > 0) {
    throw refuse('issue-blocked', `invoice ${invoiceKey} cannot be issued: ${blockers.join(', ')}`, { reasons: blockers });
  }
  for (const key of [...new Set([receivablesKey, ...prePositions.map((p) => p.accountKey)])]) {
    await assertLeafAccount(db, accountingTenantId, key);
  }
  await assertPeriodsOpen(db, touchedPeriodKeys(accountingTenantId, [pre['invoiceDate'] as string], fiscalYearStart));
  return { receivablesKey, templateId, fiscalYearStart, prePositions };
}

/**
 * Issue a draft invoice (spec 1.76, phase 1): assign the number, render the PDF into the private
 * bucket, register it as a finance-document, post the Debitoren booking and set the invoice pending.
 *
 * Idempotent and resumable. The number is assigned in a first transaction that moves the draft to the
 * transient state `issuing` (writeInvoice refuses non-drafts, so header and positions are frozen from
 * then on). The slow render follows; every id after it is deterministic (`invoice-{key}`), so a run
 * that finds `issuing` keeps the stored number and overwrites. The final transaction writes the
 * finance-document, the booking with its lines and the `pending` state atomically. A call on an
 * issued invoice (double click, retried call) returns the stored result and writes nothing.
 */
export const issueInvoice = onCall(
  // Renders a PDF with Puppeteer: one request per instance, like generateDocument.
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10 },
  async (request: CallableRequest<IssueInvoiceData>): Promise<IssueInvoiceResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';

    const invoiceKey = request.data?.invoiceKey;
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) {
      throw new HttpsError('invalid-argument', 'invoiceKey is required');
    }
    const db = getFirestore();
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
      // a resumed `issuing` invoice that now fails a check gives its number back (step 8)
      if (pre['state'] === 'issuing') await resetToDraft(db, invoiceKey, `invoice-${invoiceKey}`, Number(pre['invoiceNo'] ?? 0));
      throw e;
    }
    const { receivablesKey, templateId, fiscalYearStart, prePositions } = preflight;

    // ---- 4. number: draft → issuing (an `issuing` invoice keeps its number) ----
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
      const patch = { invoiceNo, invoiceId: String(invoiceNo), state: 'issuing' };
      tx.update(invoiceRef, patch);
      return { done: false as const, invoice: { ...invoice, ...patch } };
    });
    if (numbered.done) return storedResult(numbered.invoice);

    const invoice = numbered.invoice;
    const invoiceNo = Number(invoice['invoiceNo'] ?? 0);
    const invoiceId = String(invoice['invoiceId'] ?? '');
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
      for (const key of [...new Set(positions.map((p) => p.accountKey))].filter((k) => !prePositions.some((p) => p.accountKey === k))) {
        await assertLeafAccount(db, accountingTenantId, key);
      }
      const invoiceDate = String(invoice['invoiceDate']);
      const periodKeys = touchedPeriodKeys(accountingTenantId, [invoiceDate], fiscalYearStart);
      const receiver = invoice['receiver'] as Receiver;
      const title = String(invoice['title'] ?? '').trim() || `Rechnung ${invoiceId}`;

      // ---- 5./6. address and PDF (slow, idempotent: deterministic path) ----
      const address = await receiverAddress(db, receiver, tenantId);
      const filename = `${invoiceId}.pdf`;
      const fullPath = `tenant/${tenantId}/private/finance/invoices/${invoiceKey}.pdf`;
      const rendered = await renderDocument({
        templateId,
        payload: buildInvoicePayload({
          invoiceId,
          title,
          invoiceDate,
          dueDate: String(invoice['dueDate'] ?? ''),
          receiver: { name1: receiver?.name1 ?? '', name2: receiver?.name2 ?? '', modelType: receiver?.modelType ?? '' },
          positions,
          address,
        }),
        options: { outputFormat: 'pdf', filename },
      }, uid, tenantId, { bucket: privateBucket(), path: fullPath });

      // ---- 7. finance-document, booking, lines, pending — atomically ----
      const tenants = (invoice['tenants'] as string[] | undefined) ?? [tenantId];
      const lines = invoiceBookingLines(positions, receivablesKey);
      const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);
      const result = await db.runTransaction(async (tx) => {
        // reads (all before any write)
        const current = (await tx.get(invoiceRef)).data();
        if (!current) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
        if (issueOutcome(String(current['state'] ?? '')) === 'already-issued') return storedResult(current); // a concurrent run won
        if (current['state'] !== 'issuing' || Number(current['invoiceNo']) !== invoiceNo) {
          throw refuse('state-changed', `invoice ${invoiceKey} changed while it was issued`);
        }
        await assertPeriodsOpen(db, periodKeys, tx);
        const bookingExists = (await tx.get(bookingRef)).exists;
        let bookingNo = 0;
        if (!bookingExists) {
          const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
          bookingNo = nextBookingNo(ledger.docs.map((s) => s.data() as { date?: string; bookingNo?: number }), Number(invoiceDate.substring(0, 4)));
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
        if (!bookingExists) {
          tx.set(bookingRef, withoutUndefined({
            tenants, accountingTenantId, isArchived: false,
            title, date: invoiceDate, notes: '', tags: 'invoice', index: '',
            bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, invoiceDate, fiscalYearStart),
            documentKey, documentKeys: [documentKey], counterparty: receiver,
          }));
          lines.forEach((line, i) => {
            tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-${i}`), withoutUndefined({
              tenants, accountingTenantId, isArchived: false, bookingKey, accountKey: line.accountKey,
              ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
              ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
            }));
          });
        }
        tx.update(invoiceRef, { state: 'pending', documentKey, bookingKey });
        return { invoiceNo, documentKey, bookingKey };
      });
      committed = true;
      logger.info(`${CF_NAME}: issued ${invoiceKey} as ${invoiceId} (tenant=${tenantId})`);
      return result;
    } catch (e) {
      if (!committed) await resetToDraft(db, invoiceKey, bookingKey, invoiceNo);
      throw e;
    }
  },
);

/**
 * Best effort after a failed issue: give the number back, but only while the invoice is still
 * `issuing` with this number and no booking was committed — never touch a pending invoice.
 */
async function resetToDraft(db: Firestore, invoiceKey: string, bookingKey: string, invoiceNo: number): Promise<void> {
  const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);
  try {
    await db.runTransaction(async (tx) => {
      const invoice = (await tx.get(invoiceRef)).data();
      const booking = await tx.get(db.collection(BOOKING_COLLECTION).doc(bookingKey));
      // a concurrent run may have reset and re-numbered it: only release our own number
      if (invoice?.['state'] !== 'issuing' || Number(invoice['invoiceNo']) !== invoiceNo || booking.exists) return;
      tx.update(invoiceRef, { state: 'draft', invoiceNo: 0, invoiceId: '' });
    });
  } catch (e) {
    logger.error(`${CF_NAME}: could not reset ${invoiceKey} to draft`, e);
  }
}
