/** Pure payload of the reminder (Mahnung) PDF template `scs-mahnung` (spec 1.76 phase 3). Amounts in: Rappen. */

import { chf, viewDate } from './invoice.logic';
import { ReminderLike, reminderFeeSum } from './invoice-payment.logic';
import { reminderDisplayName } from './invoice-reminder.logic';

export const REMINDER_LEVEL_TEXTS: Record<number, string> = {
  1: 'Vielleicht ist unsere Rechnung untergegangen. Wir bitten dich, den offenen Betrag bis zum unten genannten Datum zu überweisen.',
  2: 'Leider haben wir deine Zahlung noch nicht erhalten. Bitte überweise den offenen Betrag bis zum unten genannten Datum.',
  3: 'Trotz unserer Erinnerungen ist der Betrag noch offen. Bitte überweise ihn bis zum unten genannten Datum; danach müssen wir weitere Schritte prüfen.',
};

export interface ReminderPayloadInput {
  invoice: {
    invoiceId: string;
    invoiceDate: string;
    title: string;
    totalAmount?: { amount: number } | null;
    payments?: { amount: number }[];
    reminders?: ReminderLike[];
  };
  level: number;
  templateName: string;
  date: string;
  dueDate: string;
  fee: number; // the reminder being created (not yet in invoice.reminders)
  recipient: Record<string, string>;
}

/**
 * Template/QR-slip payload. The slip reads `amount` (parsed by buildQrSlipData) and `qrMessage`;
 * `qrAmount` carries the same amount as a number.
 */
export function buildReminderPayload(i: ReminderPayloadInput): Record<string, unknown> {
  const inv = i.invoice;
  const total = inv.totalAmount?.amount ?? 0;
  const feesTotal = reminderFeeSum(inv.reminders) + i.fee;
  const paidTotal = (inv.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const amountDue = Math.max(0, total + feesTotal - paidTotal);
  const textLevel = Math.min(Math.max(i.level, 1), 3); // legacy wording for the old scs-mahnung template
  return {
    ...i.recipient,
    heading: reminderDisplayName({ level: i.level, templateName: i.templateName }),
    level: i.level,
    levelText: REMINDER_LEVEL_TEXTS[textLevel],
    invoiceId: inv.invoiceId,
    invoiceTitle: inv.title,
    invoiceDate: viewDate(inv.invoiceDate),
    reminderDate: viewDate(i.date),
    dueDate: viewDate(i.dueDate),
    totalAmount: chf(total),
    feesTotal: chf(feesTotal),
    paidTotal: chf(paidTotal),
    amountDue: chf(amountDue),
    amount: chf(amountDue),
    qrSlipWithAmount: true,
    qrAmount: amountDue / 100,
    qrMessage: `Rechnung ${inv.invoiceId}`,
  };
}
