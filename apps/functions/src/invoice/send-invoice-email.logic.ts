import { ReminderLike } from './invoice-payment.logic';

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

const reminderName = (level: number): string => (level <= 1 ? 'Zahlungserinnerung' : `${level}. Mahnung`);

export function invoiceEmailSubject(kind: EmailKind, level: number, invoiceId: string, orgName: string): string {
  const what = kind === 'invoice' ? 'Rechnung' : `${reminderName(level)} zu Rechnung`;
  return `${what} ${invoiceId} – ${orgName}`;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Short German du-form body; every input is HTML-escaped, no links. */
export function invoiceEmailHtml(
  kind: EmailKind, level: number, invoiceId: string, amountDueChf: string, dueDateView: string, orgName: string,
): string {
  const id = escapeHtml(invoiceId);
  const amount = escapeHtml(amountDueChf);
  const due = escapeHtml(dueDateView);
  const until = due ? ` bis ${due}` : '';
  const sentence = kind === 'invoice'
    ? `im Anhang findest du die Rechnung ${id}. Bitte überweise CHF ${amount}${until}.`
    : `im Anhang findest du die ${escapeHtml(reminderName(level))} zu Rechnung ${id}. Bitte überweise den offenen Betrag von CHF ${amount}${until}.`;
  return `<p>Hallo,</p><p>${sentence} Vielen Dank.</p><p>Freundliche Grüsse<br>${escapeHtml(orgName)}</p>`;
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
