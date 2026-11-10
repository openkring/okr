// apps/functions/src/pingen/credit-binding.ts
//
// Binds the Postversand credit port (credit-port.ts) to the real prepaid credit of spec 1.149. Kept apart from
// credit-port.ts on purpose: this file pulls in firebase-admin and the credit ledger, which the pure port and its
// specs must stay free of. Imported once, for its side effect, from pingen/index.ts.
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { CreditAccountCollection } from '@okr/shared-models';
import { quoteTransaction } from '@okr/business-metering-util';

import { deductCredit, reverseCredit } from '../credit/credit-api';
import { bindCreditPort, makeCreditPort } from './credit-port';
import type { CreditPort } from './credit-port';

/** The port over the real 1.149 functions; `db` is resolved per call (tests pass an in-memory Firestore). */
export function makeBoundCreditPort(db: () => Firestore = getFirestore): CreditPort {
  return makeCreditPort({
    // 1.149 names the rates unitPrice / pagePrice; the port contract says perUnit / perPage.
    quoteTransaction: (product, units, pages) => {
      const q = quoteTransaction(product, units, pages);
      return { total: q.total, perUnit: q.unitPrice, perPage: q.pagePrice };
    },
    readBalance: async (tenantId) => {
      const account = (await db().collection(CreditAccountCollection).doc(tenantId).get()).data();
      return Number(account?.['balance'] ?? 0);
    },
    deductCredit: (tenantId, input) => deductCredit(db(), tenantId, input),
    reverseCredit: (tenantId, entryId, reason, part, key) => reverseCredit(db(), tenantId, entryId, reason, part, key),
  });
}

bindCreditPort(makeBoundCreditPort());
