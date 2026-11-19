/**
 * Trigger `onBillWrittenTrainerMirror` (spec 1.167 §7.6): keeps `trainerInvoices/{key}.state` equal to the state of its
 * Kreditor (draft → sent, todo/overdue → booked, paid → paid). A deleted bill changes nothing: a reject deletes the bill
 * itself and sets `rejected`. A `rejected` invoice is never touched, so a late trigger of an older write cannot bring a
 * rejected invoice back to `sent`.
 */
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

import { BillCollection, TrainerInvoiceCollection, TrainerInvoiceState } from '@okr/shared-models';
import { trainerInvoiceStateForBill } from '@okr/finance-trainer-billing-util';

type BillLike = { trainerInvoiceKey?: string; state?: string } | undefined;

/** Pure: the invoice state the written bill implies, or `undefined` (no trainer bill, bill deleted, no mapped state). */
export function mirrorUpdate(before: BillLike, after: BillLike): TrainerInvoiceState | undefined {
  void before;
  if (!after || !after.trainerInvoiceKey) return undefined;
  return trainerInvoiceStateForBill(after.state as never);
}

export const onBillWrittenTrainerMirror = onDocumentWritten({ document: `${BillCollection}/{id}`, region: 'europe-west6' }, async (event) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as BillLike) : undefined;
  const afterSnap = event.data?.after;
  const after = afterSnap?.exists ? (afterSnap.data() as BillLike) : undefined;
  const target = mirrorUpdate(before, after);
  if (!target || !after?.trainerInvoiceKey) return;

  const db = getFirestore();
  const ref = db.collection(TrainerInvoiceCollection).doc(after.trainerInvoiceKey);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const stored = snap.get('state');
    if (stored === 'rejected' || stored === target) return;
    tx.update(ref, { state: target });
    logger.info(`onBillWrittenTrainerMirror: ${ref.id} ${String(stored)} -> ${target}`);
  });
});
