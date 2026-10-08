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

/** Highest existing level + 1; 1 when there is none. */
export function nextReminderLevel(reminders: ReminderLike[] | undefined): number {
  return (reminders ?? []).reduce((m, r) => Math.max(m, r.level ?? 0), 0) + 1;
}

/** Refusal codes for a reminder (spec 1.90): not-payable, no-reminder-date, invalid-fee. The level is the server's. */
export function reminderBlockers(invoice: { state: string }, date: string, fee: number): string[] {
  const blockers: string[] = [];
  if (!isPayableState(invoice.state)) blockers.push('not-payable');
  if (!isValidStoreDate(date)) blockers.push('no-reminder-date');
  if (!Number.isInteger(fee) || fee < 0) blockers.push('invalid-fee');
  return blockers;
}

/** The reminder an earlier call with this idempotency key stored, if any. */
export function reminderByRequest(reminders: ReminderLike[] | undefined, requestId: string): ReminderLike | undefined {
  if (!requestId) return undefined;
  return (reminders ?? []).find((r) => r.requestId === requestId);
}

/** A client idempotency key: 1-64 characters of letters, digits and dashes (crypto.randomUUID fits). */
export function isValidRequestId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(id);
}

/**
 * Why a template cannot render a reminder: unknown, of another tenant, archived or not published
 * (`no-reminder-template`), or not of category dunning (`template-not-dunning`).
 */
export function dunningTemplateRefusal(template: Record<string, unknown> | undefined, tenantId: string): 'no-reminder-template' | 'template-not-dunning' | undefined {
  if (!template) return 'no-reminder-template';
  if (!((template['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return 'no-reminder-template';
  if (template['isArchived'] === true || template['status'] !== 'published') return 'no-reminder-template';
  if (template['category'] !== 'dunning') return 'template-not-dunning';
  return undefined;
}

/** The default fee (Rappen) for a template with QR slip: reminderFee, else the legacy reminderFees[1], else the model default. */
export function configReminderFee(config: Record<string, unknown>): number {
  const direct = config['reminderFee'];
  const legacy = (config['reminderFees'] as number[] | undefined)?.[1];
  const fee = Number.isFinite(direct) ? (direct as number) : Number.isFinite(legacy) ? (legacy as number) : DEFAULT_REMINDER_FEES[1];
  return Math.max(0, fee);
}

/**
 * The default fee (Rappen) of a legacy (pre-1.90) call for `level`: reminderFees[level - 1], else
 * DEFAULT_REMINDER_FEES[level - 1]; 0 when that entry is missing, not finite or negative. Old clients asked
 * for a level, so they are charged that level's fee, not the 1.90 single reminderFee.
 */
export function legacyLevelFee(config: Record<string, unknown>, level: number): number {
  const fees = Array.isArray(config['reminderFees']) ? (config['reminderFees'] as unknown[]) : DEFAULT_REMINDER_FEES;
  const fee = Number.isInteger(level) && level >= 1 ? fees[level - 1] : undefined;
  return typeof fee === 'number' && Number.isFinite(fee) ? Math.max(0, fee) : 0;
}

/** The reminder's name: the template name it was created with, else the 1.76 level naming (spec 1.90 D7). */
export function reminderDisplayName(r: { level: number; templateName?: string }): string {
  if (r.templateName) return r.templateName;
  return (r.level ?? 1) <= 1 ? 'Zahlungserinnerung' : `${r.level}. Mahnung`;
}

/** The reminder list with the reminder of `documentKey` marked as sent; undefined when no reminder has that key. */
export function markReminderSent(reminders: ReminderLike[] | undefined, documentKey: string, sentAt: string, via: 'email' | 'post'): ReminderLike[] | undefined {
  const list = reminders ?? [];
  if (!list.some((r) => r.documentKey === documentKey)) return undefined;
  return list.map((r) => coalesceReminder(r.documentKey === documentKey ? { ...r, isSent: true, sentAt, sentVia: via } : r));
}

/** The stored reminder of this level, if any. */
export function storedReminder(reminders: ReminderLike[] | undefined, level: number): ReminderLike | undefined {
  return (reminders ?? []).find(r => r.level === level);
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

/** Payable and the last due date plus the grace days lies before today. */
export function isReminderDue(invoice: { state: string; dueDate: string; reminders?: ReminderLike[] }, today: string, graceDays: number): boolean {
  if (!isPayableState(invoice.state)) return false;
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
  templateId: r.templateId ?? '', templateName: r.templateName ?? '', sentAt: r.sentAt ?? '', sentVia: r.sentVia ?? '', requestId: r.requestId ?? '',
});
