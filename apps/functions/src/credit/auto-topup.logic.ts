// Pure rules of the prepaid credit's top-ups (plan 1.149 Task 9). Amounts are integer Rappen.
import type { AutoTopUp } from '@okr/shared-models';
import { CreditAccountCollection, CreditAutoTopUpRequestDocId, CreditAutoTopUpSubcollection } from '@okr/shared-models';
import { MAX_TOPUP, MIN_TOPUP } from '@okr/business-metering-util';

/** After this long (by its requestedAt) a request or pending top-up no longer blocks a new one. */
export const AUTO_TOPUP_STALE_MS = 24 * 60 * 60 * 1000;

/** The collection path of a tenant's auto top-up request doc (id `request`); a path, so either fake Firestore takes it. */
export const autoTopUpCollectionPath = (tenantId: string): string => `${CreditAccountCollection}/${tenantId}/${CreditAutoTopUpSubcollection}`;
export const AUTO_TOPUP_REQUEST_ID = CreditAutoTopUpRequestDocId;

/** Should an auto top-up start now? Only below the threshold, switched on, with autopay and none pending. */
export function autoTopUpDue(balanceAfter: number, settings: AutoTopUp, autopay: boolean, pendingTopUp: boolean): boolean {
  if (!settings?.enabled || !autopay || pendingTopUp) return false;
  if (!(settings.amount > 0)) return false;
  return balanceAfter < settings.threshold;
}

/**
 * A request (or the top-up it is charging) is pending from its request until it is credited or its charge fails,
 * but at most 24 h: `staleBefore` is the StoreDateTime 24 h ago; a request at or before it is stale. A pending
 * invoice without a request time is stale too.
 */
export function isAutoTopUpPending(request: Record<string, unknown> | undefined, staleBefore: string): boolean {
  const requestedAt = String(request?.['requestedAt'] ?? '');
  const pendingKey = String(request?.['pendingInvoiceKey'] ?? '');
  if (!requestedAt && !pendingKey) return false;
  return requestedAt > staleBefore;
}

/** '' when `amount` is a valid top-up, else why not. */
export function topUpAmountRefusal(amount: unknown): string {
  if (typeof amount !== 'number' || !Number.isInteger(amount)) return 'amount must be a whole number of Rappen';
  if (amount < MIN_TOPUP) return `amount must be at least ${MIN_TOPUP} Rappen`;
  if (amount > MAX_TOPUP) return `amount must be at most ${MAX_TOPUP} Rappen`;
  return '';
}

/** The invoice key of an auto top-up: deterministic from its request, so a re-run never issues a second one. */
export const autoTopUpInvoiceKey = (tenantId: string, requestedAt: string): string => `topup-${tenantId}-${requestedAt}`;

/** '' when `value` can be (part of) a document id we build, else why not: never rewritten, so two never collide. */
export function idPartRefusal(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return `${name} is required`;
  if (value.includes('/')) return `${name} must not contain '/'`;
  return '';
}

type Doc = Record<string, unknown> | undefined;

/** The request doc write that carries a new auto top-up request: its requestedAt, else ''. */
export function newAutoTopUpRequest(before: Doc, after: Doc): string {
  const requestedAt = String(after?.['requestedAt'] ?? '');
  if (!requestedAt || requestedAt === String(before?.['requestedAt'] ?? '')) return '';
  return requestedAt;
}

/** A stale pending top-up invoice in one of these states is charged again under its own key; otherwise dropped. */
const RERUN_STATES = ['draft', 'issuing', 'pending', 'partial', 'unpaid'];
export const pendingInvoiceRerunnable = (state: unknown): boolean => RERUN_STATES.includes(String(state ?? ''));

/** A top-up invoice whose state just turned 'paid'. */
export function topUpTurnedPaid(before: Doc, after: Doc): boolean {
  return after?.['billingKind'] === 'topup' && after?.['state'] === 'paid' && before?.['state'] !== 'paid';
}
