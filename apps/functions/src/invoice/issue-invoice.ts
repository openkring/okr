import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { issueDraftInvoice, IssueInvoiceResult } from './invoice-issue.core';


const REGION = 'europe-west6';
const CF_NAME = 'issueInvoice';

interface IssueInvoiceData {
  invoiceKey?: string;
}

/**
 * Issue a draft invoice (spec 1.76, phase 1): assign the number, render the PDF into the private
 * bucket, register it as a finance-document, post the Debitoren booking and set the invoice pending.
 * The callable shell: App Check, authentication, the treasurer role and the caller's tenant; the
 * idempotent, resumable issue itself is `issueDraftInvoice` (invoice-issue.core.ts).
 */
export const issueInvoice = onCall(
  // Renders a PDF with Puppeteer: one request per instance, like generateDocument.
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10 },
  async (request: CallableRequest<IssueInvoiceData>): Promise<IssueInvoiceResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const invoiceKey = request.data?.invoiceKey;
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) {
      throw new HttpsError('invalid-argument', 'invoiceKey is required');
    }
    return issueDraftInvoice(getFirestore(), { tenantId, invoiceKey, actor: request.auth?.uid ?? '' });
  },
);
