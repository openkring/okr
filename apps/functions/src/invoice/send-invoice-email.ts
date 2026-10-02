import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection, InvoiceCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { DEFAULT_EMAIL_PROVIDER, EmailAttachment, sendEmailViaProvider } from '../auth/email-transport';
import { getAppEmailConfig } from '../auth/email-templates';
import { privateBucket } from '../_storage/private-bucket';
import { reportToSentry } from '../srv/sentry';
import { loadOwnedAccountingConfig, ReceiverRef, refuse } from './invoice-context';
import { InvoiceLike, openAmount, ReminderLike } from './invoice-payment.logic';
import { lastDueDate } from './invoice-reminder.logic';
import { chf, viewDate, withoutUndefined } from './invoice.logic';
import { emailDocumentKind, invoiceEmailAsksPayment, invoiceEmailHtml, invoiceEmailSubject, recipientDirectoryId, scrubEmailAddresses, sendRefusal } from './send-invoice-email.logic';

const REGION = 'europe-west6';
const CF_NAME = 'sendInvoiceEmail';

interface SendInvoiceEmailData {
  invoiceKey?: string;
  documentKey?: string;
}

interface SendInvoiceEmailResult {
  sentAt: string;
  kind: 'invoice' | 'reminder';
  level?: number;
}

type Doc = Record<string, unknown>;

/** A stored reminder with every field defined (Firestore refuses undefined, also nested). */
const coalesceReminder = (r: ReminderLike): ReminderLike => ({
  level: r.level ?? 0, date: r.date ?? '', dueDate: r.dueDate ?? '', isSent: r.isSent ?? false,
  documentKey: r.documentKey ?? '', fee: Number.isFinite(r.fee) ? (r.fee as number) : 0, bookingKey: r.bookingKey ?? '',
});

/**
 * Mail an issued invoice PDF, or one of its reminder PDFs, to the receiver's favourite email (spec 1.76 D12).
 * The address is read server-side from the address-directory projection and never leaves the server; logs
 * carry the recipient count only. Treasurer-only. A send is not idempotent: a retry mails again.
 * `orgName` in subject and body is the tenant's `appName` (app-config).
 */
export const sendInvoiceEmail = onCall(
  {
    region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB', timeoutSeconds: 60,
    secrets: ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS', 'SENTRY_FUNCTIONS_DSN'],
  },
  async (request: CallableRequest<SendInvoiceEmailData>): Promise<SendInvoiceEmailResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const { invoiceKey, documentKey } = request.data ?? {};
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
    if (typeof documentKey !== 'string' || !documentKey.trim()) throw new HttpsError('invalid-argument', 'documentKey is required');

    const db = getFirestore();
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
    // defense in depth: the app offers "Mahnung senden" only on open invoices, "Rechnung senden" never on a cancelled one
    const refusal = sendRefusal(target.kind, String(invoice['state'] ?? ''));
    if (refusal === 'not-payable') throw refuse('not-payable', `invoice ${invoiceKey} is ${String(invoice['state'] ?? '')}: no reminder mail`);
    if (refusal === 'not-sendable') throw refuse('not-sendable', `invoice ${invoiceKey} is cancelled: not mailed`);

    const document = (await db.collection(FinanceDocumentCollection).doc(documentKey).get()).data();
    const fullPath = String(document?.['fullPath'] ?? '');
    if (!document || !fullPath || !((document['tenants'] as string[] | undefined) ?? []).includes(tenantId)) throw refuse('no-document', `finance-document ${documentKey} not found`);

    // recipient: favourite email of the receiver, as collected by this tenant (address-directory projection)
    const dirId = recipientDirectoryId(tenantId, (invoice['receiver'] as ReceiverRef) ?? {});
    const dir = dirId ? (await db.collection('address-directory').doc(dirId).get()).data() : undefined;
    const favEmail = String(dir?.['favEmail'] ?? '').trim();
    if (!favEmail) throw refuse('no-email', `the receiver of invoice ${invoiceKey} has no favourite email`);

    let content: Buffer;
    try {
      [content] = await privateBucket().file(fullPath).download();
    } catch (e) {
      logger.error(`${CF_NAME}: PDF of ${documentKey} could not be read`, { detail: String((e as Error)?.message ?? e).slice(0, 300) });
      throw refuse('no-document', `the PDF of ${documentKey} is missing`);
    }

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
      ? String(reminders?.find((r) => r.level === level)?.dueDate ?? '')
      : String(invoice['dueDate'] || lastDueDate({ dueDate: '', reminders }));
    const open = openAmount(likeInvoice);
    const attachment: EmailAttachment = {
      filename: target.kind === 'invoice' ? `${invoiceId}.pdf` : `Mahnung-${level}-${invoiceId}.pdf`,
      content, contentType: 'application/pdf',
    };
    const providerSnap = await db.collection('app-config').doc(tenantId).get();
    const provider = String(providerSnap.data()?.['emailProvider'] ?? DEFAULT_EMAIL_PROVIDER);

    try {
      await sendEmailViaProvider(provider, {
        from: emailConfig.from,
        to: [favEmail],
        subject: invoiceEmailSubject(target.kind, level, invoiceId, orgName),
        html: invoiceEmailHtml(target.kind, level, invoiceId, chf(open), dueDate ? viewDate(dueDate) : '', orgName, invoiceEmailAsksPayment(likeInvoice.state, open)),
        attachments: [attachment],
      });
    } catch (e) {
      const detail = scrubEmailAddresses(String((e as Error)?.message ?? e)).slice(0, 300);
      logger.error(`${CF_NAME}: provider ${provider} failed for ${invoiceKey} (recipients=1)`, { detail });
      await reportToSentry({
        message: 'sendInvoiceEmail: provider send failed',
        tags: { appId: tenantId, provider, kind: target.kind },
        extra: { detail },
        fingerprint: ['sendInvoiceEmail', provider],
      });
      throw new HttpsError('internal', 'The email could not be sent.');
    }
    logger.info(`${CF_NAME}: ${target.kind} ${documentKey} mailed (recipients=1)`);

    const sentAt = getTodayStr(DateFormat.StoreDate);
    const result: SendInvoiceEmailResult = target.kind === 'invoice' ? { sentAt, kind: 'invoice' } : { sentAt, kind: 'reminder', level };
    try {
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(invoiceRef)).data();
        if (!fresh) return;
        if (target.kind === 'invoice') {
          tx.update(invoiceRef, { sentAt });
        } else {
          const list = ((fresh['reminders'] as ReminderLike[] | undefined) ?? []).map((r) => coalesceReminder(r.level === level ? { ...r, isSent: true } : r));
          tx.update(invoiceRef, withoutUndefined({ reminders: list }));
        }
      });
    } catch (e) {
      // the mail is out: report success so the user does not send it twice
      logger.error(`${CF_NAME}: ${documentKey} mailed but the sent mark failed`, { detail: String((e as Error)?.message ?? e).slice(0, 300) });
    }
    return result;
  },
);
