import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { DEFAULT_REMINDER_DUE_DAYS, FinanceDocumentCollection, InvoiceCollection, TemplateCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, nextBookingNo } from '@okr/shared-util-functions';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { assertPeriodsOpen } from '../booking/period-lock';
import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { privateBucket } from '../_storage/private-bucket';
import { renderDocument } from '../pdf/render-document';
import { assertLeafAccount, loadOwnedAccountingConfig, receiverAddress, ReceiverRef, refuse } from './invoice-context';
import { InvoiceLike, isValidStoreDate, openAmount } from './invoice-payment.logic';
import { confirmationDocumentFields } from './payment-confirmation.logic';
import {
  coalesceReminder, configReminderFee, dunningTemplateRefusal, isValidRequestId, nextReminderLevel, reminderBlockers, reminderByRequest,
  reminderDueDate, reminderFeeLines, reminderKey, ReminderLike,
} from './invoice-reminder.logic';
import { invoiceBookingIndex, issuePeriodKeys, recipientFields, viewDate, withoutUndefined } from './invoice.logic';
import { buildReminderPayload } from './reminder-payload.logic';
import { chfText, historyDetails, writeFinanceHistory } from '../finance-history/finance-history';

const REGION = 'europe-west6';
const CF_NAME = 'createInvoiceReminder';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';

interface CreateInvoiceReminderData {
  invoiceKey?: string;
  templateId?: string;
  date?: string;
  fee?: number; // Rappen
  requestId?: string; // client idempotency key (spec 1.90)
  level?: number; // legacy clients (< 1.90) only
}

interface CreateInvoiceReminderResult {
  reminder: ReminderLike;
  openAmount: number;
}

type Doc = Record<string, unknown>;

const asInvoiceLike = (invoice: Doc): InvoiceLike => ({
  state: String(invoice['state'] ?? ''),
  totalAmount: invoice['totalAmount'] as InvoiceLike['totalAmount'],
  payments: invoice['payments'] as InvoiceLike['payments'],
  accountingTenantId: String(invoice['accountingTenantId'] ?? ''),
  reminders: invoice['reminders'] as InvoiceLike['reminders'],
});

const storedResult = (invoice: Doc, stored: ReminderLike): CreateInvoiceReminderResult => ({
  reminder: coalesceReminder(stored), openAmount: openAmount(asInvoiceLike(invoice)),
});

const reminderAsLike = (invoice: Doc) => ({ state: String(invoice['state'] ?? ''), reminders: invoice['reminders'] as ReminderLike[] | undefined });

/**
 * Create the next reminder (spec 1.90): the treasurer's dunning template, date and fee; the server assigns the
 * running number, renders the reminder PDF into the private bucket, registers it as finance-document
 * `invoice-{key}-reminder-{n}`, posts the optional reminder fee (debit receivables / credit fee account) as the
 * booking of the same key and appends the reminder to `invoice.reminders`. A retry with the same `requestId`
 * returns the stored reminder; a crash between render and transaction is repaired by the retry because the
 * PDF path and document key are deterministic.
 */
export const createInvoiceReminder = onCall(
  // Renders a PDF with Puppeteer: one request per instance, like createPaymentConfirmation.
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10 },
  async (request: CallableRequest<CreateInvoiceReminderData>): Promise<CreateInvoiceReminderResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';

    const data = request.data ?? {};
    const legacy = typeof data.templateId !== 'string' && Number.isInteger(data.level);
    const invoiceKey = data.invoiceKey;
    const date = data.date;
    const requestId = legacy ? `legacy-${data.level}` : data.requestId;
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
    if (!isValidStoreDate(date)) throw new HttpsError('invalid-argument', 'date must be a valid date (yyyyMMdd)');
    if (!isValidRequestId(requestId)) throw new HttpsError('invalid-argument', 'requestId is required');

    const db = getFirestore();
    const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);

    // ---- 1. invoice, tenant, config ----
    const pre = (await invoiceRef.get()).data();
    if (!pre) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
    const tenants = (pre['tenants'] as string[] | undefined) ?? [];
    if (!tenants.includes(tenantId)) throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
    const accountingTenantId = String(pre['accountingTenantId'] ?? '');
    const config = await loadOwnedAccountingConfig(db, tenantId, invoiceKey, accountingTenantId, 'reminded');

    // idempotency: a retry of the same call returns what the first one stored
    const already = reminderByRequest(pre['reminders'] as ReminderLike[] | undefined, requestId);
    if (already) return storedResult(pre, already);

    // ---- 2. template, fee accounts, blockers ----
    const templateId = legacy ? String(config['reminderTemplateId'] ?? '') : String(data.templateId ?? '').trim();
    if (!templateId) throw legacy ? refuse('no-reminder-template', `${accountingTenantId} has no reminder template`) : new HttpsError('invalid-argument', 'templateId is required');
    const fee = data.fee ?? (legacy ? configReminderFee(config) : undefined); // null counts as omitted
    if (typeof fee !== 'number') throw new HttpsError('invalid-argument', 'fee is required (Rappen)');
    const template = (await db.collection(TemplateCollection).doc(templateId).get()).data();
    const templateRefusal = dunningTemplateRefusal(template, tenantId);
    if (templateRefusal) throw refuse(templateRefusal, `template ${templateId} cannot render a reminder: ${templateRefusal}`);
    const templateName = String(template?.['name'] ?? '').trim() || templateId;

    const receivablesKey = String(config['receivablesAccountKey'] ?? '');
    const feeAccountKey = String(config['reminderFeeAccountKey'] ?? '');
    const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;
    const dueDays = Number.isFinite(config['reminderDueDays']) ? (config['reminderDueDays'] as number) : DEFAULT_REMINDER_DUE_DAYS;
    const blockers = reminderBlockers(reminderAsLike(pre), date, fee);
    if (blockers.length > 0) {
      throw refuse('reminder-blocked', `invoice ${invoiceKey} cannot get a reminder: ${blockers.join(', ')}`, { reasons: blockers });
    }
    if (fee > 0) {
      if (!feeAccountKey) throw refuse('no-reminder-fee-account', `${accountingTenantId} has no reminder fee account`);
      if (!receivablesKey) throw refuse('no-receivables-account', `${accountingTenantId} has no receivables account`);
      await assertLeafAccount(db, accountingTenantId, feeAccountKey);
      await assertLeafAccount(db, accountingTenantId, receivablesKey);
      // before rendering, so a locked period leaves no orphan PDF and finance-document
      await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, date, fiscalYearStart));
    }
    const lvl = nextReminderLevel(pre['reminders'] as ReminderLike[] | undefined);

    // ---- 3. render outside the transaction, register the document ----
    const key = reminderKey(invoiceKey, lvl);
    const dueDate = reminderDueDate(date, dueDays);
    const receiver = pre['receiver'] as ReceiverRef;
    const address = await receiverAddress(db, receiver, tenantId);
    const payload = buildReminderPayload({
      invoice: {
        invoiceId: String(pre['invoiceId'] ?? invoiceKey), invoiceDate: String(pre['invoiceDate'] ?? ''), title: String(pre['title'] ?? ''),
        totalAmount: pre['totalAmount'] as { amount: number } | undefined, payments: pre['payments'] as { amount: number }[] | undefined,
        reminders: pre['reminders'] as ReminderLike[] | undefined,
      },
      level: lvl, templateName, date, dueDate, fee, recipient: recipientFields(receiver, address),
    });
    const invoiceId = String(pre['invoiceId'] ?? invoiceKey);
    const filename = `${invoiceId}-reminder-${lvl}.pdf`;
    const fullPath = `tenant/${tenantId}/private/finance/invoices/${invoiceKey}-reminder-${lvl}.pdf`;
    const rendered = await renderDocument(
      // invoiceKey: the slip carries the invoice's QR reference on the QR-IBAN (spec 1.2)
      { templateId, payload: { ...payload, invoiceKey }, options: { outputFormat: 'pdf', filename } }, uid, tenantId, { bucket: privateBucket(), path: fullPath },
    );
    const today = getTodayStr(DateFormat.StoreDate);
    const documentRef = db.collection(FinanceDocumentCollection).doc(key);
    const createdOn = String((await documentRef.get()).data()?.['dateOfDocCreation'] ?? '');
    await documentRef.set(withoutUndefined(
      confirmationDocumentFields({ tenants, accountingTenantId, fullPath, filename, sizeBytes: rendered.sizeBytes, today, createdOn }),
    ));

    const ccCtx = fee > 0 ? await loadCostCenterContext(db, tenantId, accountingTenantId, [receivablesKey, feeAccountKey]) : undefined;
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(key);

    // ---- 4. one transaction: reads, decision, writes ----
    const result = await db.runTransaction(async (tx): Promise<CreateInvoiceReminderResult> => {
      const invoice = (await tx.get(invoiceRef)).data();
      if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
      if (String(invoice['accountingTenantId'] ?? '') !== accountingTenantId || !((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw refuse('state-changed', `invoice ${invoiceKey} changed while the reminder was created`);
      }
      const current = invoice['reminders'] as ReminderLike[] | undefined;
      const stored = reminderByRequest(current, requestId);
      if (stored) return storedResult(invoice, stored);
      // another call took this running number meanwhile: the PDF path would collide
      if (nextReminderLevel(current) !== lvl) throw refuse('state-changed', `invoice ${invoiceKey} got another reminder meanwhile`);
      const fresh = reminderBlockers(reminderAsLike(invoice), date, fee);
      if (fresh.length > 0) {
        throw refuse('reminder-blocked', `invoice ${invoiceKey} cannot get a reminder: ${fresh.join(', ')}`, { reasons: fresh });
      }

      let bookingNo = 0;
      if (fee > 0) {
        const bookingSnap = await tx.get(bookingRef);
        if (bookingSnap.exists) throw refuse('inconsistent-state', `booking ${key} exists but invoice ${invoiceKey} does not carry reminder ${lvl}`);
        await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, date, fiscalYearStart), tx);
        await assertLeafAccount(db, accountingTenantId, feeAccountKey, tx);
        await assertLeafAccount(db, accountingTenantId, receivablesKey, tx);
        const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
        bookingNo = nextBookingNo(ledger.docs.map((s) => s.data() as { date?: string; bookingNo?: number }), Number(date.substring(0, 4)));
      }

      // writes
      const invTenants = (invoice['tenants'] as string[] | undefined) ?? [tenantId];
      if (fee > 0) {
        const title = `Mahngebühr ${invoiceId} (${templateName})`;
        tx.set(bookingRef, withoutUndefined({
          tenants: invTenants, accountingTenantId, isArchived: false,
          title, date, notes: '', tags: 'invoice-reminder', index: invoiceBookingIndex(date, bookingNo, title, invoiceId),
          bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, date, fiscalYearStart),
          documentKeys: [key], counterparty: invoice['receiver'],
        }));
        reminderFeeLines(receivablesKey, feeAccountKey, fee).forEach((line, i) => {
          const costCenterKey = ccCtx ? costCenterKeyForLine(ccCtx, line.accountKey, { explicit: '' }) : '';
          tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${key}-${i}`), withoutUndefined({
            tenants: invTenants, accountingTenantId, isArchived: false, bookingKey: key, accountKey: line.accountKey,
            ...(costCenterKey ? { costCenterKey } : {}),
            ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
            ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
          }));
        });
      }
      const reminder: ReminderLike = coalesceReminder({
        level: lvl, date, dueDate, isSent: false, documentKey: key, fee, bookingKey: fee > 0 ? key : '',
        templateId, templateName, requestId,
      });
      const reminders = [...((invoice['reminders'] as ReminderLike[] | undefined) ?? []).map(coalesceReminder), reminder];
      tx.update(invoiceRef, withoutUndefined({ reminders }));
      return { reminder, openAmount: openAmount({ ...asInvoiceLike(invoice), reminders }) };
    });
    await writeFinanceHistory(db, { tenantId, uid: request.auth?.uid, parentKey: `invoice.${invoiceKey}`, kind: 'reminder', details: historyDetails(templateName, viewDate(String(date ?? '')), fee > 0 && chfText(fee)) });
    logger.info(`${CF_NAME}: reminder ${lvl} on ${invoiceKey} (tenant=${tenantId}, fee=${fee})`);
    return result;
  },
);
