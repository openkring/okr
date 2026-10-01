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
