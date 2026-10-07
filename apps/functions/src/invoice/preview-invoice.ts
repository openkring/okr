import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { InvoiceCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { renderDocument } from '../pdf/render-document';
import { buildInvoicePayload } from './invoice.logic';
import { loadOwnedAccountingConfig, receiverAddress, ReceiverRef, refuse } from './invoice-context';
import { readPositions } from './issue-invoice';

const REGION = 'europe-west6';
const CF_NAME = 'previewInvoicePdf';

interface PreviewInvoiceData {
  invoiceKey?: string;
}

/**
 * Render a draft invoice as PDF for a look before issuing it. Nothing is numbered, booked or registered:
 * the number reads "ENTWURF" and the QR slip carries no reference (regular IBAN). The file is overwritten
 * on every call in the private bucket (invoices carry receiver PII; the default bucket is readable via
 * imgix) and returned as base64, like showInvoicePdf. Treasurer-only.
 */
export const previewInvoicePdf = onCall(
  // Renders a PDF with Puppeteer: one request per instance, like issueInvoice.
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10 },
  async (request: CallableRequest<PreviewInvoiceData>): Promise<{ content: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';

    const invoiceKey = request.data?.invoiceKey;
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
    const db = getFirestore();
    const invoice = (await db.collection(InvoiceCollection).doc(invoiceKey).get()).data();
    if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
    if (!((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
    }
    if (invoice['state'] !== 'draft') throw refuse('not-a-draft', `invoice ${invoiceKey} is ${String(invoice['state'])}`);

    const config = await loadOwnedAccountingConfig(db, tenantId, invoiceKey, String(invoice['accountingTenantId'] ?? ''), 'previewed');
    const templateId = String(config['invoiceTemplateId'] ?? '');
    if (!templateId) throw refuse('issue-blocked', 'no invoice template', { reasons: ['no-invoice-template'] });

    const positions = await readPositions(db, invoiceKey);
    const receiver = invoice['receiver'] as ReceiverRef;
    const invoiceId = 'ENTWURF';
    const filename = `${invoiceId}.pdf`;
    const fullPath = `tenant/${tenantId}/private/finance/invoice-previews/${invoiceKey}.pdf`;
    await renderDocument({
      templateId,
      payload: buildInvoicePayload({
        invoiceId,
        title: String(invoice['title'] ?? '').trim() || 'Rechnung',
        invoiceDate: String(invoice['invoiceDate'] ?? ''),
        dueDate: String(invoice['dueDate'] ?? ''),
        receiver: { name1: receiver?.name1 ?? '', name2: receiver?.name2 ?? '', modelType: receiver?.modelType ?? '' },
        positions,
        address: await receiverAddress(db, receiver, tenantId),
      }),
      options: { outputFormat: 'pdf', filename },
    }, uid, tenantId, { bucket: privateBucket(), path: fullPath });

    const [bytes] = await privateBucket().file(fullPath).download();
    logger.info(`${CF_NAME}: previewed ${invoiceKey} (${bytes.length} bytes)`);
    return { content: bytes.toString('base64') };
  },
);
