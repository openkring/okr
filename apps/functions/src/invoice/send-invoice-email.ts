import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import {
  INVOICE_MAIL_SECRETS, InvoiceEmailRequest, prepareInvoiceMail, SendInvoiceEmailData, SendInvoiceEmailResult, sendInvoiceMail,
} from './send-invoice-email.core';

const REGION = 'europe-west6';
const CF_NAME = 'sendInvoiceEmail';
const DRAFT_CF_NAME = 'getInvoiceEmailDraft';

/** The suggested mail the composer opens with. `to` is '' when the receiver has no favourite email. */
interface InvoiceEmailDraft {
  to: string;
  from: string;
  subject: string;
  body: string;
  filename: string;
}

async function guard(request: CallableRequest<unknown>, cfName: string): Promise<string> {
  checkAppCheckToken(request as never, cfName);
  checkAuthentication(request as never, cfName);
  await checkRoles(request as never, cfName, ['treasurer']);
  return getCallerTenantId(request as never, cfName);
}

/**
 * The suggested mail for an invoice or reminder PDF, for the treasurer to review and change in the email
 * composer before sending: the receiver's favourite email, the tenant sender, the fixed subject and body
 * (spec 1.76 D12). Treasurer-only; the treasurer sees and may change every recipient.
 */
export const getInvoiceEmailDraft = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '256MiB', timeoutSeconds: 30 },
  async (request: CallableRequest<InvoiceEmailRequest>): Promise<InvoiceEmailDraft> => {
    const tenantId = await guard(request, DRAFT_CF_NAME);
    const prepared = await prepareInvoiceMail(getFirestore(), tenantId, request.data ?? {});
    return { to: prepared.favEmail, from: prepared.from, subject: prepared.subject, body: prepared.html, filename: prepared.invoicePdfPath ? `${prepared.filename} + ${prepared.invoiceFilename}` : prepared.filename };
  },
);

/**
 * Mail an issued invoice PDF, or one of its reminder PDFs (spec 1.76 D12). With `mail` (the email composer)
 * the treasurer's recipients, sender, subject, body and extra attachments are used; without it (Mahnlauf)
 * the fixed text goes to the receiver's favourite email. The PDF is always attached by the server. Logs
 * carry recipient counts only. Treasurer-only. A send is not idempotent: a retry mails again.
 * `orgName` in the default subject and body is the tenant's `appName` (app-config). The work is sendInvoiceMail.
 */
export const sendInvoiceEmail = onCall(
  {
    region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB', timeoutSeconds: 60,
    secrets: INVOICE_MAIL_SECRETS,
  },
  async (request: CallableRequest<SendInvoiceEmailData>): Promise<SendInvoiceEmailResult> => {
    const tenantId = await guard(request, CF_NAME);
    return sendInvoiceMail(getFirestore(), tenantId, request.data ?? {}, { uid: request.auth?.uid });
  },
);
