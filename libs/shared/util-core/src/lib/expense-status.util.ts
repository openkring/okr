/**
 * Pure decisions of the expense lifecycle
 * (planning/specs/2026-09-02-expense-workflow-design.md §3.6, §3.7).
 *
 * They live here so the `updateExpense` callable, the `onExpenseTaskWritten` trigger and the
 * edit form share one implementation. A UI-only copy of the locked-field rule would be a
 * security hole, not a duplication: `expenses` is CF-write-only, the callable is the boundary.
 */

/** The subset of an expense these decisions read. */
export interface ExpenseLifecycleFields {
  bookingKey?: string;
  status?: string;
}

/** Fields no one may change once the expense is booked — the ledger already depends on them. */
export function lockedExpenseFields(expense: ExpenseLifecycleFields): string[] {
  return expense.bookingKey ? ['amountTotal', 'currency', 'transferTo'] : [];
}

/**
 * The status an expense moves to when its task is completed, or undefined when it must not move.
 *
 * Completing the review task is the treasurer's "this expense is settled", so it moves to 'done'.
 * 'done' and 'cancelled' are terminal: `reviewBooking` closes the review task in the same
 * transaction that writes 'done' (approve), and a rejected expense must not be revived by a
 * later task write.
 */
export function nextStatusForCompletedTask(
  linkKey: string, expense: ExpenseLifecycleFields,
): 'done' | undefined {
  if (!linkKey.startsWith('expense.')) return undefined;
  const status = expense.status ?? '';
  if (status === 'done' || status === 'cancelled') return undefined;
  return 'done';
}
