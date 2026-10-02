import { DEFAULT_REMINDER_FEES } from '@okr/shared-models';
import { addDuration, classifyStoreDate, isValidPartialStoreDate } from '@okr/shared-util-core';

import { isPayableState, reminderFeeSum } from './invoice-payment.util';

export { reminderFeeSum };

/** At most this many reminders per invoice (server mirror: MAX_REMINDER_LEVEL). */
export const MAX_REMINDER_LEVEL = 3;

/** The reminder fields the rules read; InvoiceModel's reminders satisfy it. */
export interface ReminderLike { level: number; date: string; dueDate: string; fee?: number }

/** Highest existing level + 1; 1 when there is none. */
export function nextReminderLevel(reminders: ReminderLike[] | undefined): number {
  return (reminders ?? []).reduce((m, r) => Math.max(m, r.level ?? 0), 0) + 1;
}

/**
 * The configured fee of a level (fees[level-1]), never negative. A config without the field (legacy
 * doc) uses the model default DEFAULT_REMINDER_FEES, like the settings form (ruling P3-R2); a level
 * missing from a stored list is 0.
 */
export function defaultReminderFee(fees: readonly number[] | undefined, level: number): number {
  const fee = (fees ?? DEFAULT_REMINDER_FEES)[level - 1];
  return Number.isFinite(fee) ? Math.max(0, fee as number) : 0;
}

/**
 * The due date the next reminder counts from: the last reminder's, else the invoice's. A legacy
 * reminder without a dueDate counts from its own date.
 */
export function lastDueDate(invoice: { dueDate: string; reminders?: ReminderLike[] }): string {
  const reminders = invoice.reminders ?? [];
  if (reminders.length === 0) return invoice.dueDate;
  const last = reminders.reduce((a, b) => ((b.level ?? 0) >= (a.level ?? 0) ? b : a));
  return last.dueDate || last.date;
}

/** Payable, a level left, and the last due date plus the grace days lies before today. */
export function isReminderDue(invoice: { state: string; dueDate: string; reminders?: ReminderLike[] }, today: string, graceDays: number): boolean {
  if (!isPayableState(invoice.state)) return false;
  if (nextReminderLevel(invoice.reminders) > MAX_REMINDER_LEVEL) return false;
  const base = lastDueDate(invoice);
  if (typeof base !== 'string' || classifyStoreDate(base) !== 'full' || !isValidPartialStoreDate(base)) return false;
  return addDuration(base, { days: graceDays }) < today;
}

/** The invoices a Mahnlauf offers: the due ones, the longest overdue first. */
export function mahnlaufCandidates<T extends { state: string; dueDate: string; reminders?: ReminderLike[] }>(invoices: T[], today: string, graceDays: number): T[] {
  return invoices
    .filter((i) => isReminderDue(i, today, graceDays))
    .sort((a, b) => lastDueDate(a).localeCompare(lastDueDate(b)));
}

/** The i18n entry naming a reminder level: 1 = Zahlungserinnerung, 2 = 2. Mahnung, 3 = 3. Mahnung. */
export function reminderLevelKey(level: number): 'reminder_level_1' | 'reminder_level_2' | 'reminder_level_3' {
  if (level <= 1) return 'reminder_level_1';
  if (level === 2) return 'reminder_level_2';
  return 'reminder_level_3';
}

/** True when the treasurer may create the next reminder: payable and a level left. */
export function canCreateReminder(invoice: { state: string; reminders?: ReminderLike[] }): boolean {
  return isPayableState(invoice.state) && nextReminderLevel(invoice.reminders) <= MAX_REMINDER_LEVEL;
}

/**
 * True when the invoice PDF can be mailed: issued (not a draft, not being issued, not cancelled) and
 * with a document. Mirrors sendRefusal on the server (draft → not-issued, cancelled → not-sendable, P3-R3).
 */
export function canEmailInvoice(invoice: { state: string; documentKey?: string }): boolean {
  return !['draft', 'issuing', 'cancelled'].includes(invoice.state) && !!invoice.documentKey;
}

/** The highest-level reminder that has a PDF (what "Mahnung senden" mails), undefined when there is none. */
export function latestReminderWithDocument<T extends ReminderLike & { documentKey?: string }>(reminders: T[] | undefined): T | undefined {
  return (reminders ?? [])
    .filter((r) => !!r.documentKey)
    .reduce<T | undefined>((best, r) => (!best || (r.level ?? 0) > (best.level ?? 0) ? r : best), undefined);
}

/**
 * The fee a treasurer typed, in CHF: a number ≥ 0 with at most two decimals ('20', '20.5', '20,50').
 * undefined when the text is not such a number. The service converts to Rappen.
 */
export function parseReminderFee(text: unknown): number | undefined {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const value = Number(s);
  return Number.isFinite(value) ? value : undefined;
}

/** Why the reminder alert's input is not accepted yet: a missing date (StoreDate) or an invalid fee. */
export function reminderInputProblem(date: string, feeText: unknown): 'date' | 'fee' | undefined {
  if (!/^\d{8}$/.test(date ?? '') || !isValidPartialStoreDate(date) || classifyStoreDate(date) !== 'full') return 'date';
  if (parseReminderFee(feeText) === undefined) return 'fee';
  return undefined;
}
