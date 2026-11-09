// apps/functions/src/credit/credit-api.ts
//
// The server API of the prepaid credit (plan 1.149 Task 9) for senders such as 2.144 Pingen: deduct before a
// send, reverse the part of a deduction that was not delivered. Neither issues an invoice nor calls Stripe
// (Ruling R9): a deduction that takes the balance below the auto top-up threshold only stamps a request on
// credit-accounts/{tenantId}; auto-topup.trigger.ts issues and charges the top-up off the send path.
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type { Firestore } from 'firebase-admin/firestore';
import { CreditAccountCollection, CreditEntrySubcollection, SubscriptionCollection } from '@okr/shared-models';
import type { AutoTopUp } from '@okr/shared-models';
import { quoteTransaction, TRANSACTION_PRICES } from '@okr/business-metering-util';
import type { TransactionProduct, TransactionQuote } from '@okr/business-metering-util';

import { toStoreDateTime } from '../srv/zurich-time';
import { applyCreditEntry } from './credit-ledger';
import { autoTopUpDue, entryIdPart, isAutoTopUpPending } from './auto-topup.logic';

/** The quote of a send, or invalid-argument for an unknown product or impossible counts. */
export function quoteOrRefuse(product: unknown, units: unknown, pages: unknown): TransactionQuote {
  if (typeof product !== 'string' || !Object.prototype.hasOwnProperty.call(TRANSACTION_PRICES, product)) {
    throw new HttpsError('invalid-argument', `unknown product ${String(product)}`);
  }
  try {
    return quoteTransaction(product as TransactionProduct, Number(units), Number(pages));
  } catch (err) {
    throw new HttpsError('invalid-argument', err instanceof Error ? err.message : String(err));
  }
}

/** Server API for 2.144 Pingen: deducts or throws HttpsError('failed-precondition', 'insufficient-credit'). */
export async function deductCredit(db: Firestore, tenantId: string, input: {
  product: TransactionProduct; units: number; pages: number; reference: string; actor: string;
}): Promise<{ entryId: string; balanceAfter: number }> {
  if (!tenantId) throw new HttpsError('invalid-argument', 'tenantId is required');
  const reference = typeof input.reference === 'string' ? input.reference.trim() : '';
  if (!reference) throw new HttpsError('invalid-argument', 'reference is required');
  const quote = quoteOrRefuse(input.product, input.units, input.pages);
  const entryId = `deduct-${entryIdPart(reference)}`;
  const { balanceAfter, duplicate } = await applyCreditEntry(db, tenantId, entryId, {
    kind: 'deduction', amount: -quote.total, date: toStoreDateTime(new Date()),
    product: quote.product, units: quote.units, pages: quote.pages, unitPrice: quote.unitPrice, pagePrice: quote.pagePrice,
    reference, reason: '', createdBy: input.actor || 'system',
  });
  if (!duplicate) {
    try {
      await requestAutoTopUpIfDue(db, tenantId);
    } catch (err) {
      // The deduction stands; a missed request is taken up by the next deduction.
      logger.error(`deductCredit: auto top-up request for ${tenantId} failed`, { error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { entryId, balanceAfter };
}

/**
 * Partial reversal of one deduction (e.g. one letter Pingen rejected). Callable several times per entry; the sum of
 * reversals never exceeds the entry (refused with failed-precondition 'reversal-exceeds-entry'); idempotent on key
 * (entry id `reverse-<entryId>-<key>`). Amount = part.units × unitPrice + part.pages × pagePrice of the original entry.
 */
export async function reverseCredit(
  db: Firestore, tenantId: string, entryId: string, reason: string, part: { units: number; pages: number }, key: string,
): Promise<{ amount: number; balanceAfter: number; duplicate: boolean }> {
  const units = Number(part?.units);
  const pages = Number(part?.pages);
  if (!Number.isInteger(units) || !Number.isInteger(pages) || units < 0 || pages < 0 || units + pages === 0) {
    throw new HttpsError('invalid-argument', 'part needs whole, non-negative units and pages, not both 0');
  }
  const reversalKey = typeof key === 'string' ? entryIdPart(key) : '';
  if (!reversalKey) throw new HttpsError('invalid-argument', 'key is required');
  if (!entryId) throw new HttpsError('invalid-argument', 'entryId is required');

  const original = await db.collection(CreditAccountCollection).doc(tenantId).collection(CreditEntrySubcollection).doc(entryId).get();
  if (!original.exists) throw new HttpsError('not-found', `credit entry ${entryId} not found`);
  const o = original.data() ?? {};
  if (o['kind'] !== 'deduction') throw new HttpsError('failed-precondition', 'only a deduction can be reversed', { reason: 'not-a-deduction' });
  const unitPrice = Number(o['unitPrice'] ?? 0);
  const pagePrice = Number(o['pagePrice'] ?? 0);
  const amount = units * unitPrice + pages * pagePrice;
  if (!(amount > 0)) throw new HttpsError('invalid-argument', 'the part has no price');

  const result = await applyCreditEntry(db, tenantId, `reverse-${entryId}-${reversalKey}`, {
    kind: 'reversal', amount, date: toStoreDateTime(new Date()),
    product: String(o['product'] ?? ''), units, pages, unitPrice, pagePrice,
    reference: entryId, reason: String(reason ?? ''), createdBy: 'system',
  }, { parentEntryId: entryId });
  return { amount, ...result };
}

/**
 * Stamps `autoTopUpRequestedAt` when an auto top-up is due, in a transaction so two parallel deductions
 * request it once. auto-topup.trigger.ts takes it from there.
 */
export async function requestAutoTopUpIfDue(db: Firestore, tenantId: string): Promise<boolean> {
  const sub = (await db.collection(SubscriptionCollection).doc(tenantId).get()).data();
  if (!sub) return false;
  const settings = (sub['autoTopUp'] ?? { enabled: false, threshold: 0, amount: 0 }) as AutoTopUp;
  const autopay = sub['autopay'] === true;
  if (!settings.enabled || !autopay) return false;
  const accountRef = db.collection(CreditAccountCollection).doc(tenantId);
  return db.runTransaction(async tx => {
    const account = (await tx.get(accountRef)).data();
    if (!account) return false;
    if (!autoTopUpDue(Number(account['balance'] ?? 0), settings, autopay, isAutoTopUpPending(account))) return false;
    tx.update(accountRef, { autoTopUpRequestedAt: toStoreDateTime(new Date()) });
    return true;
  });
}
