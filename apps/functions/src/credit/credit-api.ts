// apps/functions/src/credit/credit-api.ts
//
// The server API of the prepaid credit (plan 1.149 Task 9) for senders such as 2.144 Pingen: deduct before a
// send, reverse the part of a deduction that was not delivered. Neither issues an invoice nor calls Stripe
// (Ruling R9): a deduction that takes the balance below the auto top-up threshold only stamps a request on
// credit-accounts/{tenantId}/auto-top-up/request; auto-topup.trigger.ts issues and charges it off the send path.
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { CreditAccountCollection, CreditEntrySubcollection, SubscriptionCollection } from '@okr/shared-models';
import type { AutoTopUp } from '@okr/shared-models';
import { quoteTransaction, TRANSACTION_PRICES, transactionAmount } from '@okr/business-metering-util';
import type { TransactionProduct, TransactionQuote } from '@okr/business-metering-util';

import { toStoreDateTime } from '../srv/zurich-time';
import { applyCreditEntry } from './credit-ledger';
import { AUTO_TOPUP_STALE_MS, idPartRefusal } from './auto-topup.logic';

/** The quote of a send, or invalid-argument for an unknown product or counts that are not whole numbers (no coercion). */
export function quoteOrRefuse(product: unknown, units: unknown, pages: unknown): TransactionQuote {
  if (typeof product !== 'string' || !Object.prototype.hasOwnProperty.call(TRANSACTION_PRICES, product)) {
    throw new HttpsError('invalid-argument', `unknown product ${String(product)}`);
  }
  if (typeof units !== 'number' || !Number.isInteger(units) || typeof pages !== 'number' || !Number.isInteger(pages)) {
    throw new HttpsError('invalid-argument', 'units and pages must be whole numbers');
  }
  try {
    return quoteTransaction(product as TransactionProduct, units, pages);
  } catch (err) {
    throw new HttpsError('invalid-argument', err instanceof Error ? err.message : String(err));
  }
}

function refuseIdPart(name: string, value: unknown): asserts value is string {
  const refusal = idPartRefusal(name, value);
  if (refusal) throw new HttpsError('invalid-argument', refusal);
}

/** The StoreDateTime 24 h before `now`: a request at or before it is stale. */
const staleBeforeOf = (now: Date): string => toStoreDateTime(new Date(now.getTime() - AUTO_TOPUP_STALE_MS));

/**
 * Server API for 2.144 Pingen: deducts or throws HttpsError('failed-precondition', 'insufficient-credit'). Entry id
 * `deduct-<reference>`; a reference (or tenantId) that is empty or contains '/' is refused, never rewritten. When the
 * deduction takes the balance below the auto top-up threshold, the same transaction stamps the auto top-up request.
 */
export async function deductCredit(db: Firestore, tenantId: string, input: {
  product: TransactionProduct; units: number; pages: number; reference: string; actor: string;
}): Promise<{ entryId: string; balanceAfter: number }> {
  refuseIdPart('tenantId', tenantId);
  refuseIdPart('reference', input.reference);
  const quote = quoteOrRefuse(input.product, input.units, input.pages);
  const entryId = `deduct-${input.reference}`;
  const now = new Date();
  const sub = (await db.collection(SubscriptionCollection).doc(tenantId).get()).data();
  const settings = (sub?.['autoTopUp'] ?? { enabled: false, threshold: 0, amount: 0 }) as AutoTopUp;
  const autopay = sub?.['autopay'] === true;
  const { balanceAfter } = await applyCreditEntry(db, tenantId, entryId, {
    kind: 'deduction', amount: -quote.total, date: toStoreDateTime(now),
    product: quote.product, units: quote.units, pages: quote.pages, unitPrice: quote.unitPrice, pagePrice: quote.pagePrice,
    reference: input.reference, reason: '', createdBy: input.actor || 'system',
  }, settings.enabled && autopay ? { autoTopUp: { settings, autopay, requestedAt: toStoreDateTime(now), staleBefore: staleBeforeOf(now) } } : {});
  return { entryId, balanceAfter };
}

/**
 * Partial reversal of one deduction (e.g. one letter Pingen rejected). Callable several times per entry; the sum of
 * reversals never exceeds the entry (refused with failed-precondition 'reversal-exceeds-entry'); idempotent on key
 * (entry id `reverse-<entryId>-<key>`). Amount = the part priced like the send (`transactionAmount`: units × unitPrice
 * plus the pages beyond the included ones × pagePrice) at the prices stored on the original entry.
 */
export async function reverseCredit(
  db: Firestore, tenantId: string, entryId: string, reason: string, part: { units: number; pages: number }, key: string,
): Promise<{ amount: number; balanceAfter: number; duplicate: boolean }> {
  refuseIdPart('tenantId', tenantId);
  refuseIdPart('entryId', entryId);
  refuseIdPart('key', key);
  const units = part?.units;
  const pages = part?.pages;
  if (typeof units !== 'number' || typeof pages !== 'number' || !Number.isInteger(units) || !Number.isInteger(pages)
    || units < 0 || pages < 0 || units + pages === 0) {
    throw new HttpsError('invalid-argument', 'part needs whole, non-negative units and pages, not both 0');
  }

  const original = await db.collection(CreditAccountCollection).doc(tenantId).collection(CreditEntrySubcollection).doc(entryId).get();
  if (!original.exists) throw new HttpsError('not-found', `credit entry ${entryId} not found`);
  const o = original.data() ?? {};
  if (o['kind'] !== 'deduction') throw new HttpsError('failed-precondition', 'only a deduction can be reversed', { reason: 'not-a-deduction' });
  const product = String(o['product'] ?? '');
  const unitPrice = Number(o['unitPrice'] ?? 0);
  const pagePrice = Number(o['pagePrice'] ?? 0);
  const includedPages = TRANSACTION_PRICES[product as TransactionProduct]?.includedPages ?? 0;
  const amount = transactionAmount({ perUnit: unitPrice, perPage: pagePrice, includedPages }, units, pages);
  if (!(amount > 0)) throw new HttpsError('invalid-argument', 'the part has no price');

  const result = await applyCreditEntry(db, tenantId, `reverse-${entryId}-${key}`, {
    kind: 'reversal', amount, date: toStoreDateTime(new Date()),
    product, units, pages, unitPrice, pagePrice,
    reference: entryId, reason: String(reason ?? ''), createdBy: 'system',
  }, { parentEntryId: entryId });
  return { amount, ...result };
}
