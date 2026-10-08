import { DEFAULT_REMINDER_FEES } from '@okr/shared-models';
import { addDuration, classifyStoreDate, isValidPartialStoreDate } from '@okr/shared-util-core';

import type { InvoiceI18n } from './invoice-i18n';
import { isPayableState, isWaivedReminder, reminderFeeSum, WAIVE_REASON_MAX } from './invoice-payment.util';

export { reminderFeeSum };

/** The reminder fields the rules read; InvoiceModel's reminders satisfy it. */
export interface ReminderLike {
  level: number; date: string; dueDate: string; fee?: number; bookingKey?: string; waivedAt?: string;
  documentKey?: string; templateName?: string; sentAt?: string; sentVia?: string;
}

/** Highest existing level + 1; 1 when there is none. */
export function nextReminderLevel(reminders: ReminderLike[] | undefined): number {
  return (reminders ?? []).reduce((m, r) => Math.max(m, r.level ?? 0), 0) + 1;
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

/** Payable (no level limit, spec 1.90), and the last due date plus the grace days lies before today. */
export function isReminderDue(invoice: { state: string; dueDate: string; reminders?: ReminderLike[] }, today: string, graceDays: number): boolean {
  if (!isPayableState(invoice.state)) return false;
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

/** True when the treasurer may create a reminder: the invoice is payable (spec 1.90: no level limit). */
export function canCreateReminder(invoice: { state: string; reminders?: ReminderLike[] }): boolean {
  return isPayableState(invoice.state);
}

/**
 * True when the invoice PDF can be mailed: issued (not a draft, not being issued, not cancelled) and
 * with a document. Mirrors sendRefusal on the server (draft → not-issued, cancelled → not-sendable, P3-R3).
 */
export function canEmailInvoice(invoice: { state: string; documentKey?: string }): boolean {
  return !['draft', 'issuing', 'cancelled'].includes(invoice.state) && !!invoice.documentKey;
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

/**
 * The reminder whose fee *Gebühr erlassen* waives: the highest level with a fee, a fee booking and no
 * waiver yet, on a payable invoice; undefined when there is none.
 */
export function waivableReminder<T extends ReminderLike>(invoice: { state: string; reminders?: T[] }): T | undefined {
  if (!isPayableState(invoice.state)) return undefined;
  return (invoice.reminders ?? [])
    .filter((r) => Number.isFinite(r.fee) && (r.fee as number) > 0 && !!r.bookingKey && !isWaivedReminder(r))
    .reduce<T | undefined>((best, r) => (!best || (r.level ?? 0) > (best.level ?? 0) ? r : best), undefined);
}

/** Why the waiver alert's input is not accepted yet (same rules as waiveReminderFee): a reason of 1 to 500 characters, a full StoreDate. */
export function waiveInputProblem(reason: string, date: string): 'reason' | 'date' | undefined {
  const trimmed = (reason ?? '').trim();
  if (trimmed.length < 1 || trimmed.length > WAIVE_REASON_MAX) return 'reason';
  if (!/^\d{8}$/.test(date ?? '') || !isValidPartialStoreDate(date) || classifyStoreDate(date) !== 'full') return 'date';
  return undefined;
}

export type ReminderChannel = 'email' | 'post';
export type ReminderDefaultField = 'feeChf' | 'channel' | 'attachInvoice';

export interface ReminderTemplateLike { okey: string; name: string; category?: string; status?: string; isArchived?: boolean; attachQrSlip?: boolean }

/** The reminder dialog (spec 1.90 §6.2); `selectedKeys` are the chosen invoices of a Mahnlauf, unused for one invoice. */
export interface ReminderFormModel {
  templateId: string; date: string; feeChf: number; channel: ReminderChannel; attachInvoice: boolean; openAmountChf: number; selectedKeys: string[];
}

/** What the dialog returns (role `confirm`). */
export interface ReminderFormResult {
  templateId: string; templateName: string; date: string; feeChf: number; channel: ReminderChannel; attachInvoice: boolean; selectedKeys: string[];
}

/** One due invoice in the Mahnlauf dialog. */
export interface ReminderCandidate { key: string; label: string; openAmountChf: number; lastReminder: string }

/** The templates a reminder may use: category dunning, published, not archived. */
export function dunningTemplates<T extends ReminderTemplateLike>(templates: T[]): T[] {
  return templates.filter((t) => t.category === 'dunning' && t.status === 'published' && !t.isArchived);
}

/** Rappen; reminderFee, else the legacy reminderFees[1], else the model default (spec 1.90 §4.2). */
export function configReminderFee(config: { reminderFee?: number; reminderFees?: number[] } | undefined): number {
  const direct = config?.reminderFee;
  const legacy = config?.reminderFees?.[1];
  const fee = Number.isFinite(direct) ? (direct as number) : Number.isFinite(legacy) ? (legacy as number) : DEFAULT_REMINDER_FEES[1];
  return Math.max(0, fee);
}

/** D3: a template with QR slip replaces the invoice (fee, post, no attachment); one without is informal (no fee, email, attachment). */
export function reminderDefaults(template: ReminderTemplateLike | undefined, configFeeRappen: number): Pick<ReminderFormModel, ReminderDefaultField> {
  return template?.attachQrSlip
    ? { feeChf: configFeeRappen / 100, channel: 'post', attachInvoice: false }
    : { feeChf: 0, channel: 'email', attachInvoice: true };
}

/** The model after a template change: its defaults, except for the fields the treasurer changed by hand. */
export function applyTemplateDefaults(model: ReminderFormModel, template: ReminderTemplateLike | undefined, configFeeRappen: number,
  touched: ReadonlySet<ReminderDefaultField>): ReminderFormModel {
  const defaults = reminderDefaults(template, configFeeRappen);
  const next = { ...model };
  (Object.keys(defaults) as ReminderDefaultField[]).forEach((field) => {
    if (!touched.has(field)) (next as Record<ReminderDefaultField, unknown>)[field] = defaults[field];
  });
  return next;
}

export function newReminderFormModel(templates: ReminderTemplateLike[], preselectedId: string, configFeeRappen: number,
  openAmountRappen: number, today: string, selectedKeys: string[] = []): ReminderFormModel {
  const template = templates.find((t) => t.okey === preselectedId) ?? templates[0];
  return {
    templateId: template?.okey ?? '', date: today, openAmountChf: openAmountRappen / 100, selectedKeys,
    ...reminderDefaults(template, configFeeRappen),
  };
}

/** The reminder's name: its template name, else the 1.76 level naming (spec 1.90 D7). */
export function reminderDisplayName(r: { level: number; templateName?: string },
  i18n: Pick<InvoiceI18n, 'reminder_level_1' | 'reminder_level_2' | 'reminder_level_3'>): string {
  if (r.templateName) return r.templateName;
  if ((r.level ?? 1) <= 1) return i18n.reminder_level_1();
  if (r.level === 2) return i18n.reminder_level_2();
  return i18n.reminder_level_3();
}

/** A requestId waiting for a successful createInvoiceReminder, with the input it was made for. */
export interface PendingReminderRequest { key: string; requestId: string }

/**
 * The requestId for creating a reminder on `invoiceKey`: the pending one while the input (`inputKey`) is
 * unchanged, so a retry after a client timeout returns the stored reminder instead of creating a second one;
 * else a new one from `newId`, stored in `pending`. The caller deletes the entry once a create succeeded.
 */
export function pendingRequestId(pending: Map<string, PendingReminderRequest>, invoiceKey: string, inputKey: string, newId: () => string): string {
  const existing = pending.get(invoiceKey);
  if (existing && existing.key === inputKey) return existing.requestId;
  const requestId = newId();
  pending.set(invoiceKey, { key: inputKey, requestId });
  return requestId;
}

/** The input key pendingRequestId compares: template, date and fee of a reminder request. */
export function reminderInputKey(input: { templateId: string; date: string; feeChf: number }): string {
  return JSON.stringify({ templateId: input.templateId, date: input.date, feeChf: input.feeChf });
}
