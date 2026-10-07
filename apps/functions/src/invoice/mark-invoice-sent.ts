import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { InvoiceCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { refuse } from './invoice-context';

const REGION = 'europe-west6';
const CF_NAME = 'markInvoiceSent';

interface MarkInvoiceSentData {
  invoiceKey?: string;
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
    await db.runTransaction(async (tx) => {
      const invoice = (await tx.get(invoiceRef)).data();
      if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
      if (!((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
      }
      const state = String(invoice['state'] ?? '');
      if (state === 'draft' || state === 'issuing' || state === 'cancelled' || !invoice['documentKey']) {
        throw refuse('not-sendable', `invoice ${invoiceKey} is ${state} without a PDF to send`);
      }
      tx.update(invoiceRef, { sentAt, sentVia: 'post' });
    });
    logger.info(`${CF_NAME}: ${invoiceKey} marked as sent by post (tenant=${tenantId})`);
    return { sentAt };
  },
);
