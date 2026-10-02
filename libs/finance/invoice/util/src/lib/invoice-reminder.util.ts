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

/** The configured fee of a level (fees[level-1]), 0 when unconfigured, never negative. */
export function defaultReminderFee(fees: number[] | undefined, level: number): number {
  const fee = fees?.[level - 1];
  return Number.isFinite(fee) ? Math.max(0, fee as number) : 0;
}

/** The due date the next reminder counts from: the last reminder's, else the invoice's. */
export function lastDueDate(invoice: { dueDate: string; reminders?: ReminderLike[] }): string {
  const reminders = invoice.reminders ?? [];
  if (reminders.length === 0) return invoice.dueDate;
  const last = reminders.reduce((a, b) => ((b.level ?? 0) >= (a.level ?? 0) ? b : a));
  return last.dueDate;
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
