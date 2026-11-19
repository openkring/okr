/**
 * Callable `markTrainerInvoicePaid({ invoiceKey })` (spec 1.167 §7.5): in books kept outside Kring (bexio) there is
 * no Kreditor that delivers the status, so the treasurer closes a `sent` trainer invoice by hand.
 */
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { TrainerInvoiceCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { loadBooksInvoice } from './treasurer-caller';

const REGION = 'europe-west6';
const CF_NAME = 'markTrainerInvoicePaid';

/** Pure: why this invoice cannot be marked paid by hand ('' = it can). */
export function markPaidRefusal(backend: unknown, state: unknown): '' | 'native-books' | 'not-sent' {
  if ((backend ?? 'native') === 'native') return 'native-books';
  return state === 'sent' ? '' : 'not-sent';
}

export async function markInvoicePaid(db: Firestore, uid: string, data: { invoiceKey?: unknown }): Promise<void> {
  const { invoice, config, invoiceKey } = await loadBooksInvoice(db, uid, data?.invoiceKey);
  const refusal = markPaidRefusal(config['accountingBackend'], invoice['state']);
  if (refusal) {
    throw new HttpsError('failed-precondition', refusal === 'native-books' ? 'the status follows the Kreditor in these books' : 'only a sent trainer invoice can be marked paid', { reason: refusal });
  }
  const ref = db.collection(TrainerInvoiceCollection).doc(invoiceKey);
  await db.runTransaction(async (tx) => {
    const state = (await tx.get(ref)).data()?.['state'];
    if (state !== 'sent') throw new HttpsError('failed-precondition', 'only a sent trainer invoice can be marked paid', { reason: 'not-sent' });
    tx.update(ref, { state: 'paid' });
  });
  logger.info(`${CF_NAME}: ${invoiceKey} paid`);
}

/** Callable: `{ invoiceKey }`; refusals carry `details.reason`. */
export const markTrainerInvoicePaid = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ invoiceKey: string }>): Promise<void> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await markInvoicePaid(getFirestore(), request.auth?.uid ?? '', request.data);
  },
);
