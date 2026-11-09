// Pure rules of the prepaid credit's top-ups (plan 1.149 Task 9). Amounts are integer Rappen.
import type { AutoTopUp } from '@okr/shared-models';
import { MAX_TOPUP, MIN_TOPUP } from '@okr/business-metering-util';

/** Should an auto top-up start now? Only below the threshold, switched on, with autopay and none pending. */
export function autoTopUpDue(balanceAfter: number, settings: AutoTopUp, autopay: boolean, pendingTopUp: boolean): boolean {
  if (!settings?.enabled || !autopay || pendingTopUp) return false;
  if (!(settings.amount > 0)) return false;
  return balanceAfter < settings.threshold;
}

/** An auto top-up is pending from its request until it is credited or its charge fails. */
export function isAutoTopUpPending(account: Record<string, unknown> | undefined): boolean {
  return String(account?.['autoTopUpRequestedAt'] ?? '') !== '' || String(account?.['autoTopUpPendingInvoiceKey'] ?? '') !== '';
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

/** A credit entry id may not contain '/', and must not be '.' / '..' or start with '__'. */
export function entryIdPart(value: string): string {
  return value.trim().replace(/\//g, '_').replace(/^__/, '_').replace(/^\.{1,2}$/, '_');
}

type Doc = Record<string, unknown> | undefined;

/** The credit account update that carries a new auto top-up request (not yet taken up). */
export function newAutoTopUpRequest(before: Doc, after: Doc): string {
  const requestedAt = String(after?.['autoTopUpRequestedAt'] ?? '');
  if (!requestedAt || requestedAt === String(before?.['autoTopUpRequestedAt'] ?? '')) return '';
  if (String(after?.['autoTopUpPendingInvoiceKey'] ?? '') !== '') return '';
  return requestedAt;
}

/** A top-up invoice whose state just turned 'paid'. */
export function topUpTurnedPaid(before: Doc, after: Doc): boolean {
  return after?.['billingKind'] === 'topup' && after?.['state'] === 'paid' && before?.['state'] !== 'paid';
}
