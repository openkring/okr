import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { DocumentReference, Firestore, getFirestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection, InvoiceCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { DEFAULT_EMAIL_PROVIDER, EmailAttachment, sendEmailViaProvider } from '../auth/email-transport';
import { getAppEmailConfig } from '../auth/email-templates';
import { privateBucket } from '../_storage/private-bucket';
import { reportToSentry } from '../srv/sentry';
import { loadOwnedAccountingConfig, ReceiverRef, refuse } from './invoice-context';
import { InvoiceLike, openAmount, ReminderLike } from './invoice-payment.logic';
import { lastDueDate, markReminderSent, reminderDisplayName } from './invoice-reminder.logic';
import { chf, viewDate, withoutUndefined } from './invoice.logic';
import {
  ComposedInvoiceMail, emailDocumentKind, invoiceEmailAsksPayment, invoiceEmailHtml, invoiceEmailSubject,
  normalizeComposedMail, recipientDirectoryId, reminderMailFilename, scrubEmailAddresses, sendRefusal,
} from './send-invoice-email.logic';
import { emailDetails, writeFinanceHistory } from '../finance-history/finance-history';

const REGION = 'europe-west6';
const CF_NAME = 'sendInvoiceEmail';
const DRAFT_CF_NAME = 'getInvoiceEmailDraft';

interface InvoiceEmailRequest {
  invoiceKey?: string;
  documentKey?: string;
  /** A reminder mail also carries the invoice PDF (spec 1.90). Ignored for the invoice mail itself. */
  attachInvoice?: boolean;
}

interface SendInvoiceEmailData extends InvoiceEmailRequest {
  /** The mail as composed by the treasurer. Without it the fixed text goes to the receiver's favourite email (Mahnlauf). */
  mail?: ComposedInvoiceMail;
}

interface SendInvoiceEmailResult {
  sentAt: string;
  kind: 'invoice' | 'reminder';
  level?: number;
}

/** The suggested mail the composer opens with. `to` is '' when the receiver has no favourite email. */
interface InvoiceEmailDraft {
  to: string;
  from: string;
  subject: string;
  body: string;
  filename: string;
}

type Doc = Record<string, unknown>;

/** Everything both callables derive from one invoice document, after all checks passed. */
interface PreparedInvoiceMail {
  invoiceRef: DocumentReference;
  target: { kind: 'invoice' } | { kind: 'reminder'; level: number };
  level: number;
  favEmail: string;
  from: string;
  subject: string;
  html: string;
  pdfPath: string;
  filename: string;
  /** Storage path of the invoice PDF to attach to a reminder mail, '' when not attached. */
  invoicePdfPath: string;
  invoiceFilename: string;
}

/**
 * The checks and defaults shared by the draft and the send: the invoice belongs to the caller's tenant and
 * books, is issued, the document is its own and may be mailed in this state, the PDF exists. The default
 * recipient is the receiver's favourite email as collected by this tenant (address-directory projection).
 */
async function prepareInvoiceMail(db: Firestore, tenantId: string, data: InvoiceEmailRequest): Promise<PreparedInvoiceMail> {
  const { invoiceKey, documentKey } = data;
  if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
  if (typeof documentKey !== 'string' || !documentKey.trim()) throw new HttpsError('invalid-argument', 'documentKey is required');

  const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);
  const invoice = (await invoiceRef.get()).data() as Doc | undefined;
  if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
  const tenants = (invoice['tenants'] as string[] | undefined) ?? [];
  if (!tenants.includes(tenantId)) throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
  await loadOwnedAccountingConfig(db, tenantId, invoiceKey, String(invoice['accountingTenantId'] ?? ''), 'mailed');
  if (String(invoice['state'] ?? '') === 'draft') throw refuse('not-issued', `invoice ${invoiceKey} is still a draft`);

  const reminders = invoice['reminders'] as ReminderLike[] | undefined;
  const target = emailDocumentKind({ documentKey: String(invoice['documentKey'] ?? ''), reminders }, documentKey);
  if (!target) throw refuse('foreign-document', `document ${documentKey} does not belong to invoice ${invoiceKey}`);
  const level = target.kind === 'reminder' ? target.level : 0;
  const reminder = target.kind === 'reminder' ? reminders?.find((r) => r.documentKey === documentKey) : undefined;
  const name = reminder ? reminderDisplayName(reminder) : '';
  // defense in depth: the app offers "Mahnung senden" only on open invoices, "Rechnung senden" never on a cancelled one
  const waivedAt = String(reminder?.waivedAt ?? '');
  const refusal = sendRefusal(target.kind, String(invoice['state'] ?? ''), waivedAt);
  if (refusal === 'not-payable') throw refuse('not-payable', `invoice ${invoiceKey} is ${String(invoice['state'] ?? '')}: no reminder mail`);
  if (refusal === 'already-waived') throw refuse('already-waived', `reminder ${level} of invoice ${invoiceKey} has its fee waived: no reminder mail`);
  if (refusal === 'not-sendable') throw refuse('not-sendable', `invoice ${invoiceKey} is cancelled: not mailed`);

  const document = (await db.collection(FinanceDocumentCollection).doc(documentKey).get()).data();
  const pdfPath = String(document?.['fullPath'] ?? '');
  if (!document || !pdfPath || !((document['tenants'] as string[] | undefined) ?? []).includes(tenantId)) throw refuse('no-document', `finance-document ${documentKey} not found`);

  const attachInvoice = target.kind === 'reminder' && data.attachInvoice === true;
  let invoicePdfPath = '';
  if (attachInvoice) {
    const invoiceDocKey = String(invoice['documentKey'] ?? '');
    const invoiceDoc = invoiceDocKey ? (await db.collection(FinanceDocumentCollection).doc(invoiceDocKey).get()).data() : undefined;
    invoicePdfPath = String(invoiceDoc?.['fullPath'] ?? '');
    if (!invoicePdfPath) throw refuse('no-document', `invoice ${invoiceKey} has no PDF to attach`);
  }

  const dirId = recipientDirectoryId(tenantId, (invoice['receiver'] as ReceiverRef) ?? {});
  const dir = dirId ? (await db.collection('address-directory').doc(dirId).get()).data() : undefined;
  const favEmail = String(dir?.['favEmail'] ?? '').trim();

  const invoiceId = String(invoice['invoiceId'] ?? invoiceKey);
  const emailConfig = await getAppEmailConfig(tenantId);
  const orgName = emailConfig.appName;
  const likeInvoice: InvoiceLike = {
    state: String(invoice['state'] ?? ''),
    totalAmount: invoice['totalAmount'] as InvoiceLike['totalAmount'],
    payments: invoice['payments'] as InvoiceLike['payments'],
    accountingTenantId: String(invoice['accountingTenantId'] ?? ''),
    reminders,
  };
  const dueDate = target.kind === 'reminder'
    ? String(reminder?.dueDate ?? '')
    : String(invoice['dueDate'] || lastDueDate({ dueDate: '', reminders }));
  const open = openAmount(likeInvoice);
  return {
    invoiceRef, target, level, favEmail,
    from: emailConfig.from,
    subject: invoiceEmailSubject(target.kind, name, invoiceId, orgName),
    html: invoiceEmailHtml(target.kind, name, invoiceId, chf(open), dueDate ? viewDate(dueDate) : '', orgName, invoiceEmailAsksPayment(likeInvoice.state, open)),
    pdfPath,
    filename: target.kind === 'invoice' ? `${invoiceId}.pdf` : reminderMailFilename(name, invoiceId),
    invoicePdfPath, invoiceFilename: `${invoiceId}.pdf`,
  };
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
 * `orgName` in the default subject and body is the tenant's `appName` (app-config).
 */
export const sendInvoiceEmail = onCall(
  {
    region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB', timeoutSeconds: 60,
    secrets: ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS', 'SENTRY_FUNCTIONS_DSN'],
  },
  async (request: CallableRequest<SendInvoiceEmailData>): Promise<SendInvoiceEmailResult> => {
    const tenantId = await guard(request, CF_NAME);
    const db = getFirestore();
    const prepared = await prepareInvoiceMail(db, tenantId, request.data ?? {});
    const { invoiceRef, target, level } = prepared;
    const documentKey = String(request.data?.documentKey);

    let to: string[]; let cc: string[] = []; let bcc: string[] = [];
    let from = prepared.from; let subject = prepared.subject; let html = prepared.html;
    const extra: EmailAttachment[] = [];
    if (request.data?.mail) {
      const checked = normalizeComposedMail(request.data.mail, prepared.from);
      if (!checked.ok) throw refuse(checked.reason, `composed mail for ${documentKey} refused: ${checked.reason}`);
      ({ to, cc, bcc, from, subject, html } = checked.mail);
      for (const a of checked.mail.extraAttachments) {
        extra.push({ filename: a.filename, content: Buffer.from(a.contentBase64, 'base64'), contentType: a.contentType ?? 'application/octet-stream' });
      }
    } else {
      if (!prepared.favEmail) throw refuse('no-email', `the receiver of invoice ${invoiceRef.id} has no favourite email`);
      to = [prepared.favEmail];
    }

    let content: Buffer;
    try {
      [content] = await privateBucket().file(prepared.pdfPath).download();
    } catch (e) {
      logger.error(`${CF_NAME}: PDF of ${documentKey} could not be read`, { detail: String((e as Error)?.message ?? e).slice(0, 300) });
      throw refuse('no-document', `the PDF of ${documentKey} is missing`);
    }
    const attachments: EmailAttachment[] = [{ filename: prepared.filename, content, contentType: 'application/pdf' }];
    if (prepared.invoicePdfPath) {
      try {
        const [invoiceContent] = await privateBucket().file(prepared.invoicePdfPath).download();
        attachments.push({ filename: prepared.invoiceFilename, content: invoiceContent, contentType: 'application/pdf' });
      } catch (e) {
        logger.error(`${CF_NAME}: invoice PDF of ${invoiceRef.id} could not be read`, { detail: String((e as Error)?.message ?? e).slice(0, 300) });
        throw refuse('no-document', `the PDF of invoice ${invoiceRef.id} is missing`);
      }
    }
    attachments.push(...extra);
    const attachedLabel = prepared.invoicePdfPath ? `${prepared.filename} + ${prepared.invoiceFilename}` : prepared.filename;

    const providerSnap = await db.collection('app-config').doc(tenantId).get();
    const provider = String(providerSnap.data()?.['emailProvider'] ?? DEFAULT_EMAIL_PROVIDER);
    const recipients = to.length + cc.length + bcc.length;

    try {
      await sendEmailViaProvider(provider, {
        from, to, subject, html, attachments,
        ...(cc.length > 0 ? { cc } : {}),
        ...(bcc.length > 0 ? { bcc } : {}),
      });
    } catch (e) {
      const detail = scrubEmailAddresses(String((e as Error)?.message ?? e)).slice(0, 300);
      logger.error(`${CF_NAME}: provider ${provider} failed for ${invoiceRef.id} (recipients=${recipients})`, { detail });
      await reportToSentry({
        message: 'sendInvoiceEmail: provider send failed',
        tags: { appId: tenantId, provider, kind: target.kind },
        extra: { detail },
        fingerprint: ['sendInvoiceEmail', provider],
      });
      throw new HttpsError('internal', 'The email could not be sent.');
    }
    logger.info(`${CF_NAME}: ${target.kind} ${documentKey} mailed (recipients=${recipients}, composed=${!!request.data?.mail})`);

    await writeFinanceHistory(db, {
      tenantId, uid: request.auth?.uid, parentKey: `invoice.${invoiceRef.id}`, kind: 'email',
      details: emailDetails({ to, cc, bcc, subject, filename: attachedLabel, extraFiles: extra.map((a) => a.filename) }),
    });

    const sentAt = getTodayStr(DateFormat.StoreDate);
    const result: SendInvoiceEmailResult = target.kind === 'invoice' ? { sentAt, kind: 'invoice' } : { sentAt, kind: 'reminder', level };
    try {
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(invoiceRef)).data();
        if (!fresh) return;
        if (target.kind === 'invoice') {
          tx.update(invoiceRef, { sentAt, sentVia: 'email' });
        } else {
          const list = markReminderSent(fresh['reminders'] as ReminderLike[] | undefined, documentKey, sentAt, 'email');
          if (list) tx.update(invoiceRef, withoutUndefined({ reminders: list }));
        }
      });
    } catch (e) {
      // the mail is out: report success so the user does not send it twice
      logger.error(`${CF_NAME}: ${documentKey} mailed but the sent mark failed`, { detail: String((e as Error)?.message ?? e).slice(0, 300) });
    }
    return result;
  },
);
