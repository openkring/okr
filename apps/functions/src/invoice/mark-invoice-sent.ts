import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { InvoiceCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { refuse } from './invoice-context';
import { ReminderLike } from './invoice-payment.logic';
import { markReminderSent, reminderDisplayName } from './invoice-reminder.logic';
import { withoutUndefined } from './invoice.logic';
import { writeFinanceHistory } from '../finance-history/finance-history';
import { historyDetails } from '../finance-history/finance-history.logic';

const REGION = 'europe-west6';
const CF_NAME = 'markInvoiceSent';

interface MarkInvoiceSentData {
  invoiceKey?: string;
  documentKey?: string; // a reminder's key marks that reminder (spec 1.90); absent = the invoice
}

/**
 * Record that an issued invoice was sent by post (printed and mailed by hand): sets `sentAt` = today and
 * `sentVia = 'post'`. The email path (sendInvoiceEmail) sets `sentVia = 'email'` itself. Treasurer-only;
 * invoices are written by Cloud Functions only.
 */
export const markInvoiceSent = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<MarkInvoiceSentData>): Promise<{ sentAt: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const invoiceKey = request.data?.invoiceKey;
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
    const db = getFirestore();
    const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);
    const sentAt = getTodayStr(DateFormat.StoreDate);
    let reminderName = '';
    await db.runTransaction(async (tx) => {
      const invoice = (await tx.get(invoiceRef)).data();
      if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
      if (!((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
      }
      const documentKey = request.data?.documentKey;
      if (typeof documentKey === 'string' && documentKey && documentKey !== invoice['documentKey']) {
        // a reminder sent by post: recording a fact, allowed in every invoice state (spec 1.90 §5.3)
        const list = markReminderSent(invoice['reminders'] as ReminderLike[] | undefined, documentKey, sentAt, 'post');
        if (!list) throw refuse('foreign-document', `document ${documentKey} does not belong to invoice ${invoiceKey}`);
        tx.update(invoiceRef, withoutUndefined({ reminders: list }));
        reminderName = reminderDisplayName(list.find((r) => r.documentKey === documentKey) as ReminderLike);
        return;
      }
      const state = String(invoice['state'] ?? '');
      if (state === 'draft' || state === 'issuing' || state === 'cancelled' || !invoice['documentKey']) {
        throw refuse('not-sendable', `invoice ${invoiceKey} is ${state} without a PDF to send`);
      }
      tx.update(invoiceRef, { sentAt, sentVia: 'post' });
    });
    await writeFinanceHistory(db, { tenantId, uid: request.auth?.uid, parentKey: `invoice.${invoiceKey}`, kind: 'post', details: reminderName ? historyDetails(reminderName) : undefined });
    logger.info(`${CF_NAME}: ${invoiceKey} marked as sent by post (tenant=${tenantId})`);
    return { sentAt };
  },
);
