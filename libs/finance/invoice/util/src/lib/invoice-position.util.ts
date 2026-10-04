import { AccountModel, InvoiceModel, InvoicePositionModel } from '@okr/shared-models';
import { InvoiceLayoutPositionType, isMoneyPosition, isRebatePosition } from '@okr/shared-util-core';

import { leafAccounts } from '@okr/finance-account-util';

/**
 * One position of a native invoice as the client sends it to `writeInvoice` — the same shape as the
 * functions' `PositionInput` (the client cannot import apps/functions). `amount` is a CHF decimal.
 * `type` is the kind (spec 1.84): a money type ('fix', 'rebate', …) or a layout kind ('text',
 * 'subtotal', 'pageBreak'); missing = 'fix'. A discount ('rebate') holds its negative result in
 * `amount` and, in percent mode, the rate in `discountPercent`. `discountMode` is editor state only.
 */
export interface InvoicePositionInput {
  type?: string;
  name: string;
  amount: number;
  accountKey: string;
  description?: string;
  discountPercent?: number;
  discountMode?: 'percent' | 'amount';
}

/** The header fields `writeInvoice` accepts (everything else on a draft is set by the server). */
export interface InvoiceHeaderInput {
  title: string;
  invoiceDate: string;
  dueDate: string;
  receiver: InvoiceModel['receiver'];
  notes: string;
}

/** The server refuses more positions than this (`too-many-positions`). */
export const MAX_INVOICE_POSITIONS = 100;

/** Only a draft can be edited, deleted or issued; `issuing` and everything after it is frozen. */
export function isDraftInvoice(invoice: Pick<InvoiceModel, 'state'> | undefined): boolean {
  return invoice?.state === 'draft';
}

/**
 * The invoices of one list view. `all` is the treasurer's unfiltered list. `my` (the current user's
 * own invoices) and a person key (a member's invoices) are receiver views: they show only invoices
 * that were actually issued — a draft or one still `issuing` is work in progress of the treasurer.
 */
export function invoicesForList<T extends Pick<InvoiceModel, 'state' | 'receiver'>>(
  invoices: T[], listId: string, currentPersonKey: string | undefined,
): T[] {
  if (listId === 'all') return invoices;
  const receiverKey = listId === 'my' ? currentPersonKey : listId;
  if (!receiverKey) return [];
  return invoices.filter((i) => i.receiver?.key === receiverKey && i.state !== 'draft' && i.state !== 'issuing');
}

export function newInvoicePosition(): InvoicePositionInput {
  return { name: '', amount: 0, accountKey: '' };
}

/** The label a new subtotal line starts with; the treasurer may change it. German: printed as is. */
export const SUBTOTAL_DEFAULT_NAME = 'Zwischentotal';
/** The label a new discount line starts with. German: printed as is. */
export const REBATE_DEFAULT_NAME = 'Rabatt';

/** A text, subtotal or page-break line: no amount, no account (spec 1.84 K2). */
export function newLayoutPosition(type: InvoiceLayoutPositionType): InvoicePositionInput {
  return { type, name: type === 'subtotal' ? SUBTOTAL_DEFAULT_NAME : '', amount: 0, accountKey: '' };
}

/**
 * A discount line in percent mode, booked on `accountKey` — the books' `discountAccountKey`; '' lets
 * the discount reduce the revenue accounts above it (spec 1.84 K6).
 */
export function newRebatePosition(accountKey: string): InvoicePositionInput {
  return { type: 'rebate', name: REBATE_DEFAULT_NAME, amount: 0, accountKey, discountPercent: 0, discountMode: 'percent' };
}

/** Sum in CHF of the money positions above `index` — what a subtotal shows and a percent discount applies to. */
export function subtotalAt(positions: InvoicePositionInput[], index: number): number {
  return positionsTotal(positions.slice(0, Math.max(0, index)));
}

/**
 * Recomputes every percent discount from the running total above it, in order, rounded to Rappen
 * (spec 1.84 K5) — so a second discount sees the first. Fixed-amount discounts and all other
 * positions are returned unchanged.
 */
export function applyDiscounts(positions: InvoicePositionInput[]): InvoicePositionInput[] {
  let runningRappen = 0;
  return positions.map((p) => {
    let next = p;
    if (isRebatePosition(p) && p.discountMode !== 'amount') {
      const percent = Number.isFinite(p.discountPercent) ? (p.discountPercent as number) : 0;
      // `|| 0` turns -0 (a discount on nothing) into a plain 0
      next = { ...p, amount: -Math.round(runningRappen * percent / 100) / 100 || 0 };
    }
    if (isMoneyPosition(next)) runningRappen += toRappen(Number.isFinite(next.amount) ? next.amount : 0);
    return next;
  });
}

/** Moves one item up (-1) or down (+1); a move past either end leaves the list as it is. */
export function moveItem<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** CHF decimal to integer Rappen — the server's single rounding rule. */
export function toRappen(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Sum of the money positions in CHF (discounts subtract, layout lines count nothing), added up in
 * Rappen so no float drift shows in the total.
 */
export function positionsTotal(positions: InvoicePositionInput[]): number {
  return positions
    .filter((p) => isMoneyPosition(p))
    .reduce((sum, p) => sum + toRappen(Number.isFinite(p.amount) ? p.amount : 0), 0) / 100;
}

/**
 * Stored positions back into the editable shape, in `sortOrder` (stable, so legacy rows without it
 * keep the read order). Legacy rows may lack fields — coalesce. A discount gets its editor mode back.
 */
export function toPositionInputs(positions: InvoicePositionModel[]): InvoicePositionInput[] {
  return positions
    .map((p, i) => ({ p, i, order: Number.isFinite(p.sortOrder) ? Number(p.sortOrder) : Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map(({ p }): InvoicePositionInput => {
      const input: InvoicePositionInput = {
        type: p.invoicePositionType || 'fix',
        name: p.name ?? '',
        amount: Number(p.amount ?? 0),
        accountKey: p.accountKey ?? '',
        description: p.description ?? '',
      };
      if (!isRebatePosition(input)) return input;
      const discountPercent = Number(p.discountPercent ?? 0);
      return { ...input, discountPercent, discountMode: discountPercent > 0 ? 'percent' : 'amount' };
    });
}

/** The header payload for `writeInvoice`: only the fields the callable accepts. */
export function toInvoiceHeaderInput(invoice: InvoiceModel): InvoiceHeaderInput {
  return {
    title: invoice.title ?? '',
    invoiceDate: invoice.invoiceDate ?? '',
    dueDate: invoice.dueDate ?? '',
    receiver: invoice.receiver,
    notes: invoice.notes ?? '',
  };
}

/** The account class: the first digit of the account number, leading zeros ignored (0 when none). */
export function accountClass(accountId: string): number {
  const digits = (accountId ?? '').trim().replace(/^0+/, '');
  const first = digits.charAt(0);
  return /\d/.test(first) ? Number(first) : 0;
}

/** Accounts a position may be booked on: leaf accounts (no children) of the revenue classes 3 and 4. */
export function revenueAccounts(accounts: AccountModel[]): AccountModel[] {
  return leafAccounts(accounts).filter((a) => {
    const cls = accountClass(a.id);
    return cls === 3 || cls === 4;
  });
}

/** Refusals whose individual blockers arrive as a list in `details.reasons`. */
export const INVOICE_BLOCKED_REASONS = ['issue-blocked', 'payment-blocked', 'link-blocked', 'cancel-blocked', 'reminder-blocked', 'waive-blocked'];

/**
 * The refusal reasons of a failed invoice call (`writeInvoice`, `issueInvoice`, `recordInvoicePayment`,
 * `cancelInvoice`, `createPaymentConfirmation`, `createInvoiceReminder`, `waiveReminderFee`, `sendInvoiceEmail`), most specific first. The `*-blocked` refusals carry
 * the individual blockers in `details.reasons`; a missing invoice arrives as the `not-found` code; too
 * many positions as the message of an `invalid-argument`. [] = unknown.
 */
export function invoiceRefusalReasons(error: unknown): string[] {
  const e = error as { code?: string; message?: string; details?: { reason?: unknown; reasons?: unknown } } | undefined;
  const details = e?.details;
  if (typeof details?.reason === 'string' && INVOICE_BLOCKED_REASONS.includes(details.reason)
    && Array.isArray(details.reasons) && details.reasons.length > 0) {
    return details.reasons.map((r) => String(r));
  }
  if (typeof details?.reason === 'string' && details.reason) return [details.reason];
  if (e?.code === 'functions/not-found' || e?.code === 'not-found') return ['not-found'];
  if (e?.message === 'too-many-positions') return ['too-many-positions'];
  return [];
}
