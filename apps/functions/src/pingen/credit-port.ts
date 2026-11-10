// apps/functions/src/pingen/credit-port.ts
//
// The seam between Postversand (spec 1.150) and the tenant's prepaid credit (spec 1.149). Everything
// Postversand needs from the credit ledger goes through `CreditPort`; nothing else in pingen/ imports 1.149.
//
// Bound to the real 1.149 ledger by ./credit-binding (imported from pingen/index.ts), not here: this file stays
// free of firebase-admin so its specs run without it. `makeCreditPort` wraps the 1.149 contract (`CreditPortDeps`);
// an unbound `getCreditPort()` fails closed with `unavailable` instead of pricing or deducting against nothing.

import { HttpsError } from 'firebase-functions/v2/https';

/** All amounts are Rappen. */
export interface CreditPort {
  quote(letters: number, pages: number): { total: number; perUnit: number; perPage: number };
  balance(tenantId: string): Promise<number>;
  deduct(
    tenantId: string,
    input: { letters: number; pages: number; reference: string; actor: string },
  ): Promise<{ entryId: string; balanceAfter: number }>;
  reverseShare(
    tenantId: string,
    entryId: string,
    part: { units: number; pages: number },
    key: string,
    reason: string,
  ): Promise<{ amount: number; duplicate: boolean }>;
}

/** The 1.149 functions a `CreditPort` is built from. */
export interface CreditPortDeps {
  quoteTransaction(product: 'pingen-letter', units: number, pages: number): { total: number; perUnit: number; perPage: number };
  readBalance(tenantId: string): Promise<number>;
  /** throws HttpsError failed-precondition 'insufficient-credit' */
  deductCredit(
    tenantId: string,
    input: { product: 'pingen-letter'; units: number; pages: number; reference: string; actor: string },
  ): Promise<{ entryId: string; balanceAfter: number }>;
  reverseCredit(
    tenantId: string,
    entryId: string,
    reason: string,
    part: { units: number; pages: number },
    key: string,
  ): Promise<{ amount: number; balanceAfter: number; duplicate: boolean }>;
}

export function makeCreditPort(deps: CreditPortDeps): CreditPort {
  return {
    quote: (letters, pages) => deps.quoteTransaction('pingen-letter', letters, pages),
    balance: (tenantId) => deps.readBalance(tenantId),
    deduct: (tenantId, input) => deps.deductCredit(tenantId, { product: 'pingen-letter', units: input.letters, pages: input.pages, reference: input.reference, actor: input.actor }),
    reverseShare: async (tenantId, entryId, part, key, reason) => {
      const r = await deps.reverseCredit(tenantId, entryId, reason, part, key);
      return { amount: r.amount, duplicate: r.duplicate };
    },
  };
}

let bound: CreditPort | undefined;

/** Binds the real port (done by ./credit-binding; specs bind fakes). */
export function bindCreditPort(port: CreditPort | undefined): void {
  bound = port;
}

/** The bound port; fails closed while none is bound. */
export function getCreditPort(): CreditPort {
  if (!bound) throw new HttpsError('unavailable', 'credit not configured');
  return bound;
}
