/** What a member sends to `createExpense`. `costCenterId` is accepted for older clients but ignored. */
export interface CreateExpenseFields {
  abstract?: string;
  amountTotal: number;   // cents
  currency?: string;
  transferTo?: 'me' | 'issuer';
  iban?: string;
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
    transferTo: d.transferTo === 'issuer' ? 'issuer' as const : 'me' as const,
    iban: d.iban ?? '',
    accountKey: d.accountKey ?? '',
    costCenterId: '',
    note: d.note ?? '',
  };
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
