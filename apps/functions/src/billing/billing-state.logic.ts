// apps/functions/src/billing/billing-state.logic.ts
//
// The subscription state machine of the monthly billing (plan 2 Task 5, design §7.4, states per 1.134 §3). Pure:
// billing-daily.ts and the paid trigger load the facts, turn them into events and write the result.
//
//   active  + chargeFailed | dueDatePassedUnpaid → pastDue (pastDueSince = today)
//   pastDue + allPaid                            → active
//   pastDue and today ≥ pastDueSince + 30        → closing (closingSince = today)
//   closing and today ≥ closingSince + 30        → closed
//   closing + allPaid                            → active
//   cancelled / closed never change by events.
import type { SubscriptionState } from '@okr/shared-models';
import { addDuration } from '@okr/shared-util-core';

/** Days in pastDue before closing, and in closing before closed. */
export const GRACE_DAYS = 30;
/** Off-session retries of a declined monthly charge: days after the invoice date (attempts 2, 3, 4). */
export const RETRY_DAYS: readonly number[] = [3, 7, 14];

// `today` on the failure events too: entering pastDue stamps it (an addition to the brief's interface).
export type BillingEvent =
  | { kind: 'chargeFailed'; today: string }
  | { kind: 'dueDatePassedUnpaid'; today: string }
  | { kind: 'allPaid' }
  | { kind: 'day'; today: string };

export interface BillingStateFields {
  state: SubscriptionState;
  pastDueSince: string; // StoreDate, '' when not pastDue/closing
  closingSince: string; // StoreDate, '' when not closing
}

const reached = (since: string, today: string): boolean =>
  since !== '' && today >= addDuration(since, { days: GRACE_DAYS });

export function nextState(sub: BillingStateFields, event: BillingEvent): BillingStateFields {
  const { state, pastDueSince, closingSince } = sub;
  switch (state) {
    case 'active':
      if (event.kind === 'chargeFailed' || event.kind === 'dueDatePassedUnpaid') {
        return { state: 'pastDue', pastDueSince: event.today, closingSince: '' };
      }
      return sub;
    case 'pastDue':
      if (event.kind === 'allPaid') return { state: 'active', pastDueSince: '', closingSince: '' };
      if (event.kind === 'day' && reached(pastDueSince, event.today)) return { state: 'closing', pastDueSince, closingSince: event.today };
      return sub;
    case 'closing':
      if (event.kind === 'allPaid') return { state: 'active', pastDueSince: '', closingSince: '' };
      if (event.kind === 'day' && reached(closingSince, event.today)) return { state: 'closed', pastDueSince, closingSince };
      return sub;
    default: // cancelled, closed
      return sub;
  }
}

/** The events in order. */
export function applyEvents(sub: BillingStateFields, events: readonly BillingEvent[]): BillingStateFields {
  return events.reduce(nextState, sub);
}

/**
 * The day the next retry of a declined monthly charge is due, after `retriesDone` retries (0 after the first
 * charge); '' once all retries are used up.
 */
export function nextRetryDate(issueDate: string, retriesDone: number): string {
  const days = RETRY_DAYS[retriesDone];
  return days === undefined ? '' : addDuration(issueDate, { days });
}
