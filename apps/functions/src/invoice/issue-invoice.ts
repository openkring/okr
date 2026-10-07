import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection, InvoiceCollection, InvoiceModel, InvoicePositionCollection } from '@okr/shared-models';
import { getInvoiceIndex, getNextInvoiceNo } from '@okr/finance-invoice-util';
import { DateFormat, generateQrReference, generateRandomString, getTodayStr } from '@okr/shared-util-core';
import {
  checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, nextBookingNo,
} from '@okr/shared-util-functions';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { assertPeriodsOpen } from '../booking/period-lock';
import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { privateBucket } from '../_storage/private-bucket';
import { renderDocument } from '../pdf/render-document';
import {
  buildInvoicePayload, finalizeDecision, invoiceBookingIndex, invoiceBookingLines, issueBlockers, issueHeaderBlockers, issueOutcome,
  issuePeriodKeys, PositionInput, sortPositions, withoutUndefined,
} from './invoice.logic';
import { assertLeafAccount, loadOwnedAccountingConfig, receiverAddress, refuse } from './invoice-context';
import { writeFinanceHistory } from '../finance-history/finance-history';

const REGION = 'europe-west6';
const CF_NAME = 'issueInvoice';
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
          }),
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
          const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
          const ledgerRows = ledger.docs.map((s) => s.data() as { date?: string; bookingNo?: number });
          bookingNo = nextBookingNo(ledgerRows, Number(invoiceDate.substring(0, 4)));
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
      logger.info(`${CF_NAME}: issued ${invoiceKey} as ${invoiceId} (tenant=${tenantId})`);
      return result;
    } catch (e) {
      if (!committed) await resetToDraft(db, invoiceKey, bookingKey, invoiceNo, runId);
      throw e;
    }
  },
);

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
    logger.error(`${CF_NAME}: could not reset ${invoiceKey} to draft`, e);
  }
}
