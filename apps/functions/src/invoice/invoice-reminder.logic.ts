/**
 * Pure reminder (Mahnung) rules for native invoices (spec 1.76 phase 3).
 * No Firestore access. All amounts are Rappen, all dates StoreDates (yyyyMMdd).
 * The client mirror lives in @okr/finance-invoice-util (invoice-reminder.util.ts).
 */

import { DEFAULT_REMINDER_FEES } from '@okr/shared-models';
import { addDuration } from '@okr/shared-util-core';
import { isPayableState, isValidStoreDate, isWaivedReminder, PaymentBookingLine, ReminderLike, reminderFeeSum } from './invoice-payment.logic';

export type { ReminderLike };
export { reminderFeeSum };

export const MAX_REMINDER_LEVEL = 3;

/** Highest existing level + 1; 1 when there is none. */
export function nextReminderLevel(reminders: ReminderLike[] | undefined): number {
  return (reminders ?? []).reduce((m, r) => Math.max(m, r.level ?? 0), 0) + 1;
}

/** Refusal codes for a reminder: not-payable, max-level, level-mismatch, no-reminder-date, invalid-fee. */
export function reminderBlockers(invoice: { state: string; reminders?: ReminderLike[] }, level: number, date: string, fee: number): string[] {
  const blockers: string[] = [];
  if (!isPayableState(invoice.state)) blockers.push('not-payable');
  if (level > MAX_REMINDER_LEVEL) blockers.push('max-level');
  if (level !== nextReminderLevel(invoice.reminders)) blockers.push('level-mismatch');
  if (!isValidStoreDate(date)) blockers.push('no-reminder-date');
  if (!Number.isInteger(fee) || fee < 0) blockers.push('invalid-fee');
  return blockers;
}

/** The stored reminder of this level, if any. */
export function storedReminder(reminders: ReminderLike[] | undefined, level: number): ReminderLike | undefined {
  return (reminders ?? []).find(r => r.level === level);
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

/** The reminder's due date: the reminder date plus the given days. */
export function reminderDueDate(date: string, dueDays: number): string {
  return addDuration(date, { days: dueDays });
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
  if (!isValidStoreDate(base)) return false;
  return addDuration(base, { days: graceDays }) < today;
}

/** Debit the receivables account, credit the fee account. */
export function reminderFeeLines(receivablesKey: string, feeAccountKey: string, fee: number): PaymentBookingLine[] {
  return [
    { accountKey: receivablesKey, debitAmount: { amount: fee, currency: 'CHF' } },
    { accountKey: feeAccountKey, creditAmount: { amount: fee, currency: 'CHF' } },
  ];
}

/** Key of the reminder's finance document and fee booking. */
export function reminderKey(invoiceKey: string, level: number): string {
  return `invoice-${invoiceKey}-reminder-${level}`;
}

/** Key of the fee waiver booking (spec 1.76 D18). */
export function waiverKey(invoiceKey: string, level: number): string {
  return `${reminderKey(invoiceKey, level)}-waiver`;
}

/** Longest reason of a fee waiver. */
export const WAIVE_REASON_MAX = 500;

/**
 * Refusal codes for waiving a reminder fee (spec 1.76 D18): not-payable, no-reminder, no-fee (no fee, or
 * no fee booking to reverse), already-waived, no-waive-date, invalid-reason (trimmed 1 to 500 characters).
 */
export function waiveBlockers(invoice: { state: string; reminders?: ReminderLike[] }, level: number, date: string, reason: string): string[] {
  const blockers: string[] = [];
  if (!isPayableState(invoice.state)) blockers.push('not-payable');
  const reminder = storedReminder(invoice.reminders, level);
  if (!reminder) blockers.push('no-reminder');
  else if (isWaivedReminder(reminder)) blockers.push('already-waived');
  else if (!(Number.isFinite(reminder.fee) && (reminder.fee as number) > 0) || !reminder.bookingKey) blockers.push('no-fee');
  if (!isValidStoreDate(date)) blockers.push('no-waive-date');
  const r = typeof reason === 'string' ? reason.trim() : '';
  if (r.length < 1 || r.length > WAIVE_REASON_MAX) blockers.push('invalid-reason');
  return blockers;
}

/** The fee booking keys cancelling must reverse: reminders with a fee booking whose fee was not waived, deduplicated. */
export function unwaivedFeeKeys(reminders: { bookingKey?: string; waivedAt?: string }[] | undefined): string[] {
  return [...new Set((reminders ?? []).filter((r) => !isWaivedReminder(r)).map((r) => String(r?.bookingKey ?? '')).filter((k) => !!k))];
}

/**
 * A stored reminder with every field defined (Firestore refuses undefined, also nested). The one
 * helper for every write that rewrites `invoice.reminders`, so no field (waiver, D18) is dropped.
 */
export const coalesceReminder = (r: ReminderLike): ReminderLike => ({
  level: r.level ?? 0, date: r.date ?? '', dueDate: r.dueDate ?? '', isSent: r.isSent ?? false,
  documentKey: r.documentKey ?? '', fee: Number.isFinite(r.fee) ? (r.fee as number) : 0, bookingKey: r.bookingKey ?? '',
  waivedAt: r.waivedAt ?? '', waiveBookingKey: r.waiveBookingKey ?? '',
});
