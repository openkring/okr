import { AccountModel, InvoiceModel, InvoicePositionModel } from '@okr/shared-models';

import { leafAccounts } from '@okr/finance-account-util';

/**
 * One position of a native invoice as the client sends it to `writeInvoice` — the same shape as the
 * functions' `PositionInput` (the client cannot import apps/functions). `amount` is a CHF decimal.
 */
export interface InvoicePositionInput {
  name: string;
  amount: number;
  accountKey: string;
  description?: string;
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

/** CHF decimal to integer Rappen — the server's single rounding rule. */
export function toRappen(amount: number): number {
  return Math.round(amount * 100);
}

/** Sum of the positions in CHF, added up in Rappen so no float drift shows in the total. */
export function positionsTotal(positions: InvoicePositionInput[]): number {
  return positions.reduce((sum, p) => sum + toRappen(Number.isFinite(p.amount) ? p.amount : 0), 0) / 100;
}

/** Stored positions back into the editable shape (legacy rows may lack fields — coalesce). */
export function toPositionInputs(positions: InvoicePositionModel[]): InvoicePositionInput[] {
  return positions.map((p) => ({
    name: p.name ?? '',
    amount: Number(p.amount ?? 0),
    accountKey: p.accountKey ?? '',
    description: p.description ?? '',
  }));
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

/**
 * The refusal reasons of a failed `writeInvoice` / `issueInvoice` call, most specific first.
 * `issue-blocked` carries the individual blockers in `details.reasons`; a missing invoice arrives as
 * the `not-found` code; too many positions as the message of an `invalid-argument`. [] = unknown.
 */
export function invoiceRefusalReasons(error: unknown): string[] {
  const e = error as { code?: string; message?: string; details?: { reason?: unknown; reasons?: unknown } } | undefined;
  const details = e?.details;
  if (details?.reason === 'issue-blocked' && Array.isArray(details.reasons) && details.reasons.length > 0) {
    return details.reasons.map((r) => String(r));
  }
  if (typeof details?.reason === 'string' && details.reason) return [details.reason];
  if (e?.code === 'functions/not-found' || e?.code === 'not-found') return ['not-found'];
  if (e?.message === 'too-many-positions') return ['too-many-positions'];
  return [];
}
