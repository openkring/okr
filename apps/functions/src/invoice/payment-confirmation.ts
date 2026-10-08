import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection, InvoiceCollection, PersonCollection } from '@okr/shared-models';
import { PAYMENT_CONFIRMATION_TEMPLATE_ID } from '@okr/finance-invoice-util';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { renderDocument } from '../pdf/render-document';
import { withoutUndefined } from './invoice.logic';
import { checkInvoiceReadAccess } from './invoice-access';
import { loadOwnedAccountingConfig, receiverAddress, ReceiverRef, refuse, treasurerContact } from './invoice-context';
import {
  buildConfirmationPayload, confirmationDocumentFields, confirmationPayDate, confirmationRefusal, ConfirmationInvoice,
} from './payment-confirmation.logic';
import { writeFinanceHistory } from '../finance-history/finance-history';

const REGION = 'europe-west6';
const CF_NAME = 'createPaymentConfirmation';

interface CreatePaymentConfirmationData {
  invoiceKey?: string;
}

interface CreatePaymentConfirmationResult {
  documentKey: string;
  /** base64 of the PDF */
  content: string;
}

/**
 * Payment confirmation for a paid native invoice (spec 1.76, phase 2): renders the PDF server-side
 * into the private bucket, registers it as finance-document `invoice-{key}-confirmation` (overwritten
 * on a re-run, keeping its first creation date) and returns it base64 for download. The invoice itself
 * is not changed. Allowed for whoever may read the invoice PDF (showInvoicePdf): treasurer, privileged,
 * admin, or the invoice's receiver for their own invoice.
 */
export const createPaymentConfirmation = onCall(
  // Renders a PDF with Puppeteer: one request per instance, like issueInvoice.
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10 },
  async (request: CallableRequest<CreatePaymentConfirmationData>): Promise<CreatePaymentConfirmationResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';

    const invoiceKey = request.data?.invoiceKey;
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) {
      throw new HttpsError('invalid-argument', 'invoiceKey is required');
    }
    const db = getFirestore();
    const invoice = (await db.collection(InvoiceCollection).doc(invoiceKey).get()).data();
    if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
    const tenants = (invoice['tenants'] as string[] | undefined) ?? [];
    if (!tenants.includes(tenantId)) throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
    await checkInvoiceReadAccess(request as CallableRequest, CF_NAME, invoiceKey, invoice);

    const receiver = invoice['receiver'] as ReceiverRef;
    const reason = confirmationRefusal(String(invoice['state'] ?? ''), receiver?.key);
    if (reason === 'not-paid') throw refuse('not-paid', `invoice ${invoiceKey} is ${String(invoice['state'])}, not paid`);
    if (reason === 'no-receiver') throw refuse('no-receiver', `invoice ${invoiceKey} has no receiver`);

    const accountingTenantId = String(invoice['accountingTenantId'] ?? '');
    await loadOwnedAccountingConfig(db, tenantId, invoiceKey, accountingTenantId, 'confirmed');

    const address = await receiverAddress(db, receiver, tenantId);
    const gender = receiver?.modelType === 'person' && receiver.key
      ? ((await db.collection(PersonCollection).doc(receiver.key).get()).data()?.['gender'] as string | undefined)
      : undefined;
    const payload = buildConfirmationPayload(invoice as unknown as ConfirmationInvoice, confirmationPayDate(invoice), address, gender);

    const invoiceId = String(invoice['invoiceId'] ?? invoiceKey);
    const filename = `${invoiceId}-confirmation.pdf`;
    const fullPath = `tenant/${tenantId}/private/finance/invoices/${invoiceKey}-confirmation.pdf`;
    const bucket = privateBucket();
    const rendered = await renderDocument(
      { templateId: PAYMENT_CONFIRMATION_TEMPLATE_ID, payload: { ...payload, contact: await treasurerContact(db, tenantId, getTodayStr(DateFormat.StoreDate)) }, options: { outputFormat: 'pdf', filename } },
      uid, tenantId, { bucket, path: fullPath },
    );

    const documentKey = `invoice-${invoiceKey}-confirmation`;
    const today = getTodayStr(DateFormat.StoreDate);
    const documentRef = db.collection(FinanceDocumentCollection).doc(documentKey);
    const createdOn = String((await documentRef.get()).data()?.['dateOfDocCreation'] ?? '');
    await documentRef.set(withoutUndefined(
      confirmationDocumentFields({ tenants, accountingTenantId, fullPath, filename, sizeBytes: rendered.sizeBytes, today, createdOn }),
    ));

    // renderDocument returns only metadata; read back the file it just wrote
    const [bytes] = await bucket.file(fullPath).download();
    await writeFinanceHistory(db, { tenantId, uid, parentKey: `invoice.${invoiceKey}`, kind: 'paymentConfirmation' });
    logger.info(`${CF_NAME}: ${invoiceKey} (tenant=${tenantId})`);
    return { documentKey, content: bytes.toString('base64') };
  },
);
