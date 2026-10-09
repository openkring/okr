/** What a member sends to `createExpense`. `costCenterId` is accepted for older clients but ignored. */
export interface CreateExpenseFields {
  abstract?: string;
  amountTotal: number;   // cents
  currency?: string;
  transferTo?: 'me' | 'issuer' | 'member';
  iban?: string;
  /** transferTo 'member' only (treasurer): the person the expense is entered for. */
  memberKey?: string;
  accountKey?: string;
  costCenterId?: string;
  note?: string;
}

/**
 * The member-entered fields of a new expense document. Members do not pick a Kostenstelle
 * (spec 1.65): a `costCenterId` in the request is dropped, the treasurer sets it later via
 * `updateExpense` (EDITABLE_FIELDS).
 */
export function memberExpenseFields(d: CreateExpenseFields) {
  return {
    abstract: d.abstract ?? '',
    amountTotal: d.amountTotal,
    currency: d.currency || 'CHF',
    transferTo: toTransferTo(d.transferTo),
    iban: d.iban ?? '',
    accountKey: d.accountKey ?? '',
    costCenterId: '',
    note: d.note ?? '',
  };
}

function toTransferTo(value: unknown): 'me' | 'issuer' | 'member' {
  return value === 'issuer' || value === 'member' ? value : 'me';
}

/**
 * The payee IBAN of a 'member' expense: the member's favorite bank account among THIS tenant's
 * addresses. No fallback to another tenant's entry — a person shared by two tenants may carry both
 * tenants' bank accounts, and copying the other tenant's vault entry into this tenant's expense
 * would leak it across tenants. Whitespace-free and upper-cased, like a 'me' expense's IBAN.
 */
export function pickMemberIban(addresses: { addressChannel?: string; iban?: string; isFavorite?: boolean; isArchived?: boolean; tenants?: string[] }[], tenantId: string): string {
  const banks = addresses.filter(a => a.addressChannel === 'bankaccount' && !a.isArchived && (a.iban ?? '').trim() !== '');
  const own = banks.filter(a => a.tenants?.includes(tenantId));
  const pick = own.find(a => a.isFavorite) ?? own[0];
  return (pick?.iban ?? '').replace(/\s+/g, '').toUpperCase();
}

export type ExpensePaymentTransition = 'create' | 'withdraw' | 'none';

type ExpenseState = { status?: string; isArchived?: boolean } | undefined;

export const isLiveDone = (e: ExpenseState): boolean => !!e && e.status === 'done' && e.isArchived !== true;

/** Whether an expense write creates or withdraws its draft payments (spec 1.80 §4). */
export function expensePaymentTransition(before: ExpenseState, after: ExpenseState): ExpensePaymentTransition {
  if (!before || !after) return 'none';
  const was = isLiveDone(before);
  const is = isLiveDone(after);
  if (!was && is) return 'create';
  if (was && !is) return 'withdraw';
  return 'none';
}

/** Deterministic: a redelivered trigger hits the same document and `create` fails instead of duplicating. */
export function expensePaymentId(expenseKey: string, ocrResultKey: string): string {
  return `${expenseKey}-${ocrResultKey || 'me'}`;
}

/** Deterministic per day + generation, so two concurrent first expenses race on ONE document id. */
export function collectingOrderId(tenantId: string, storeDate: string, n: number): string {
  return `${tenantId}-exp-${storeDate}-${n}`;
}

/** pain.001 MsgId (max 35 characters). */
export function collectingMessageId(tenantId: string, storeDate: string, n: number): string {
  const suffix = `-EXP-${storeDate}-${n}`;
  return tenantId.toUpperCase().slice(0, 35 - suffix.length) + suffix;
}
