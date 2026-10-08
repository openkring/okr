import { addDuration } from '@okr/shared-util-core';

import { isPayableState, isValidStoreDate, ReminderLike } from './invoice-payment.logic';

export type EmailKind = 'invoice' | 'reminder';

/** The wording of a mail: an invoice, a reminder PDF, or the invoice sent again as an informal Zahlungserinnerung (spec 1.90). */
export type EmailText = EmailKind | 'followUp';

/**
 * True when mailing the invoice PDF is a follow-up (informal Zahlungserinnerung): the invoice is still
 * payable, was sent before (`sentAt`) and its due date has passed. A late first send keeps the invoice wording.
 */
export function isInvoiceFollowUp(invoice: { state?: string; dueDate?: string; sentAt?: string }, today: string): boolean {
  if (!isPayableState(invoice.state) || !invoice.sentAt) return false;
  return isValidStoreDate(invoice.dueDate) && invoice.dueDate < today;
}

/** The pay-by date a follow-up names: today plus the reminder due days. */
export function followUpDueDate(today: string, dueDays: number): string {
  return addDuration(today, { days: dueDays });
}

/** Which document of the invoice a key names: the invoice PDF, a reminder PDF (with its level), or neither. */
export function emailDocumentKind(
  invoice: { documentKey?: string; reminders?: ReminderLike[] }, documentKey: string,
): { kind: 'invoice' } | { kind: 'reminder'; level: number } | undefined {
  if (!documentKey) return undefined;
  if (invoice.documentKey === documentKey) return { kind: 'invoice' };
  const reminder = (invoice.reminders ?? []).find((r) => r.documentKey === documentKey);
  return reminder ? { kind: 'reminder', level: reminder.level } : undefined;
}

/**
 * Why a document of an invoice in this state may not be mailed: a draft has no PDF to send yet
 * (`not-issued`); a reminder is only sent while the invoice is still open (`not-payable` — a paid or
 * cancelled invoice gets no Mahnung); a cancelled invoice is not mailed at all (`not-sendable`,
 * ruling P3-R3); a reminder whose fee was waived is not mailed either (`already-waived`: its PDF still
 * shows the fee). The invoice PDF may be mailed in any other issued state (paid: neutral body).
 */
export function sendRefusal(kind: EmailKind, state: string | undefined, waivedAt?: string): 'not-issued' | 'not-payable' | 'not-sendable' | 'already-waived' | undefined {
  if ((state ?? '') === 'draft') return 'not-issued';
  if (kind === 'reminder' && !isPayableState(state)) return 'not-payable';
  if (kind === 'reminder' && typeof waivedAt === 'string' && waivedAt.length > 0) return 'already-waived';
  if (kind === 'invoice' && state === 'cancelled') return 'not-sendable';
  return undefined;
}

/** True when the invoice mail asks for payment: the invoice is payable and something is still open (ruling P3-R3). */
export function invoiceEmailAsksPayment(state: string | undefined, openAmountRappen: number): boolean {
  return isPayableState(state) && openAmountRappen > 0;
}

export function invoiceEmailSubject(kind: EmailText, reminderName: string, invoiceId: string, orgName: string): string {
  const what = kind === 'invoice' ? 'Rechnung' : kind === 'followUp' ? 'Zahlungserinnerung zu Rechnung' : `${reminderName} zu Rechnung`;
  return `${what} ${invoiceId} – ${orgName}`;
}

/** Filename of a reminder PDF in a mail or download: the reminder name, dash-joined, then the invoice number. */
export function reminderMailFilename(reminderName: string, invoiceId: string): string {
  const name = reminderName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'Mahnung';
  return `${name}-${invoiceId}.pdf`;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Short German du-form body; every input is HTML-escaped, no links. With `asksPayment` false (an
 * invoice already paid, or nothing open) the invoice body only names the attachment — no payment request.
 */
export function invoiceEmailHtml(
  kind: EmailText, reminderName: string, invoiceId: string, amountDueChf: string, dueDateView: string, orgName: string, asksPayment = true,
): string {
  const id = escapeHtml(invoiceId);
  const signature = `<p>Freundliche Grüsse<br>${escapeHtml(orgName)}</p>`;
  if (kind === 'invoice' && !asksPayment) return `<p>Hallo,</p><p>im Anhang findest du die Rechnung ${id}.</p>${signature}`;
  const amount = escapeHtml(amountDueChf);
  const due = escapeHtml(dueDateView);
  const until = due ? ` bis ${due}` : '';
  const sentence = kind === 'invoice'
    ? `im Anhang findest du die Rechnung ${id}. Bitte überweise CHF ${amount}${until}.`
    : kind === 'followUp'
      ? `vielleicht ist unsere Rechnung untergegangen. Im Anhang findest du nochmals die Rechnung ${id}. Bitte überweise den offenen Betrag von CHF ${amount}${until}.`
      : `im Anhang findest du die ${escapeHtml(reminderName)} zu Rechnung ${id}. Bitte überweise den offenen Betrag von CHF ${amount}${until}.`;
  return `<p>Hallo,</p><p>${sentence} Vielen Dank.</p>${signature}`;
}

/** The address-directory doc id of the receiver (`getAddressDirectoryKey(tenant, '{type}.{key}')`), or undefined. */
export function recipientDirectoryId(tenantId: string, receiver: { key?: string; modelType?: string }): string | undefined {
  if (!receiver.key) return undefined;
  if (receiver.modelType !== 'person' && receiver.modelType !== 'org') return undefined;
  return `${tenantId}_${receiver.modelType}.${receiver.key}`;
}

/** Replace anything that looks like an email address, so a provider error never leaks the receiver's address into logs. */
export function scrubEmailAddresses(message: string): string {
  return message.replace(/[^\s@<>]+@[^\s@<>]+/g, '[email]');
}

/** A file the treasurer added in the composer, sent inline (base64). The invoice/reminder PDF is never one of these. */
export interface InlineMailAttachment {
  filename: string;
  contentBase64: string;
  contentType?: string;
}

/** The mail as the treasurer composed it (spec 1.76 D12, composer): replaces recipient, subject and body. */
export interface ComposedInvoiceMail {
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  from?: unknown;
  subject?: unknown;
  html?: unknown;
  extraAttachments?: unknown;
}

export interface NormalizedInvoiceMail {
  to: string[];
  cc: string[];
  bcc: string[];
  from: string;
  subject: string;
  html: string;
  extraAttachments: InlineMailAttachment[];
}

const EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
/** Same cap as the generic sendEmail callable: an inline attachment is base64 in a callable payload. */
export const MAX_INLINE_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const addressList = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return undefined;
  const list = value.map((v) => (typeof v === 'string' ? v.trim() : '')).filter((v) => v.length > 0);
  return list.every((v) => EMAIL_PATTERN.test(v)) ? list : undefined;
};

/**
 * Check a composed invoice mail and bring it into shape, or name what is wrong: at least one valid `to`,
 * only valid addresses in cc/bcc, a non-empty subject and body, a `from` that looks like an address (or
 * none: the tenant sender is used), and only inline attachments within the size cap. Storage paths are
 * not accepted here — the invoice's own PDF is attached by the server.
 */
export function normalizeComposedMail(mail: ComposedInvoiceMail, defaultFrom: string):
  { ok: true; mail: NormalizedInvoiceMail } | { ok: false; reason: 'bad-recipients' | 'bad-from' | 'no-subject' | 'no-body' | 'bad-attachment' } {
  const to = addressList(mail.to);
  const cc = addressList(mail.cc);
  const bcc = addressList(mail.bcc);
  if (!to || to.length === 0 || !cc || !bcc) return { ok: false, reason: 'bad-recipients' };
  const fromRaw = typeof mail.from === 'string' ? mail.from.trim() : '';
  if (fromRaw && !EMAIL_PATTERN.test(fromRaw)) return { ok: false, reason: 'bad-from' };
  const subject = typeof mail.subject === 'string' ? mail.subject.trim() : '';
  if (!subject) return { ok: false, reason: 'no-subject' };
  const html = typeof mail.html === 'string' ? mail.html : '';
  if (html.replace(/<[^>]*>/g, '').trim().length === 0) return { ok: false, reason: 'no-body' };
  const rawAttachments = mail.extraAttachments ?? [];
  if (!Array.isArray(rawAttachments)) return { ok: false, reason: 'bad-attachment' };
  const extraAttachments: InlineMailAttachment[] = [];
  for (const a of rawAttachments) {
    const item = a as Partial<InlineMailAttachment> | null;
    if (!item || typeof item.filename !== 'string' || !item.filename || typeof item.contentBase64 !== 'string') return { ok: false, reason: 'bad-attachment' };
    if (Math.floor(item.contentBase64.length * 3 / 4) > MAX_INLINE_ATTACHMENT_BYTES) return { ok: false, reason: 'bad-attachment' };
    extraAttachments.push({ filename: item.filename, contentBase64: item.contentBase64, ...(typeof item.contentType === 'string' && item.contentType ? { contentType: item.contentType } : {}) });
  }
  return { ok: true, mail: { to, cc, bcc, from: fromRaw || defaultFrom, subject, html, extraAttachments } };
}
