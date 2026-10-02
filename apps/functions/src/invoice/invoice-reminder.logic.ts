/**
 * Pure reminder (Mahnung) rules for native invoices (spec 1.76 phase 3).
 * No Firestore access. All amounts are Rappen, all dates StoreDates (yyyyMMdd).
 * The client mirror lives in @okr/finance-invoice-util (invoice-reminder.util.ts).
 */

import { addDuration } from '@okr/shared-util-core';
import { isPayableState, isValidStoreDate, PaymentBookingLine } from './invoice-payment.logic';

export const MAX_REMINDER_LEVEL = 3;

export interface ReminderLike {
  level: number;
  date: string;
  dueDate: string;
  isSent?: boolean;
  documentKey?: string;
  fee?: number;
  bookingKey?: string;
}

/** Sum of the reminder fees; a missing or non-finite fee (legacy migrated reminder) counts as 0. */
export function reminderFeeSum(reminders: ReminderLike[] | undefined): number {
  return (reminders ?? []).reduce((s, r) => s + (Number.isFinite(r.fee) ? (r.fee as number) : 0), 0);
}

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

/** The configured fee of a level (fees[level-1]), 0 when unconfigured, never negative. */
export function defaultReminderFee(fees: number[] | undefined, level: number): number {
  const fee = fees?.[level - 1];
  return Number.isFinite(fee) ? Math.max(0, fee as number) : 0;
}

/** The reminder's due date: the reminder date plus the given days. */
export function reminderDueDate(date: string, dueDays: number): string {
  return addDuration(date, { days: dueDays });
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
