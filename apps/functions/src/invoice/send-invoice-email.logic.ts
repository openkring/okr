import { isPayableState, ReminderLike } from './invoice-payment.logic';

export type EmailKind = 'invoice' | 'reminder';

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

const reminderName = (level: number): string => (level <= 1 ? 'Zahlungserinnerung' : `${level}. Mahnung`);

export function invoiceEmailSubject(kind: EmailKind, level: number, invoiceId: string, orgName: string): string {
  const what = kind === 'invoice' ? 'Rechnung' : `${reminderName(level)} zu Rechnung`;
  return `${what} ${invoiceId} – ${orgName}`;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Short German du-form body; every input is HTML-escaped, no links. With `asksPayment` false (an
 * invoice already paid, or nothing open) the invoice body only names the attachment — no payment request.
 */
export function invoiceEmailHtml(
  kind: EmailKind, level: number, invoiceId: string, amountDueChf: string, dueDateView: string, orgName: string, asksPayment = true,
): string {
  const id = escapeHtml(invoiceId);
  const signature = `<p>Freundliche Grüsse<br>${escapeHtml(orgName)}</p>`;
  if (kind === 'invoice' && !asksPayment) return `<p>Hallo,</p><p>im Anhang findest du die Rechnung ${id}.</p>${signature}`;
  const amount = escapeHtml(amountDueChf);
  const due = escapeHtml(dueDateView);
  const until = due ? ` bis ${due}` : '';
  const sentence = kind === 'invoice'
    ? `im Anhang findest du die Rechnung ${id}. Bitte überweise CHF ${amount}${until}.`
    : `im Anhang findest du die ${escapeHtml(reminderName(level))} zu Rechnung ${id}. Bitte überweise den offenen Betrag von CHF ${amount}${until}.`;
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
