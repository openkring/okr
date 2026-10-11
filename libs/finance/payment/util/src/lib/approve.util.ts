/** createdBy of a collecting order made by onExpenseDone; saving it in the edit modal replaces it. */
export const SYSTEM_CREATOR = 'system';

export type ApproveBlocker = '' | 'not-draft' | 'unprepared' | 'incomplete' | 'empty' | 'needs-review';

/**
 * Why a payment order cannot be released, or '' (spec 1.80 §5.3–§5.5). Shared by the
 * approvePaymentOrder callable (the enforcing side) and the detail page (which explains it).
 * No four-eyes rule: the second signature is given in e-banking (decided 2026-10-10).
 */
export function approveBlocker(
  order: { status?: string; createdBy?: string; debitAccountKey?: string; executionDate?: string },
  payments: { needsReview?: boolean }[],
): ApproveBlocker {
  if (order.status !== 'draft') return 'not-draft';
  if (!order.createdBy || order.createdBy === SYSTEM_CREATOR) return 'unprepared';
  if (!order.debitAccountKey || !order.executionDate) return 'incomplete';
  if (payments.length === 0) return 'empty';
  if (payments.some(p => p.needsReview === true)) return 'needs-review';
  return '';
}
