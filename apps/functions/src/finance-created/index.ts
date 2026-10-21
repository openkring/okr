import { logger } from 'firebase-functions/v2';
import { FirestoreEvent, onDocumentCreated, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';

import { BillCollection, BookingCollection, InvoiceCollection } from '@okr/shared-models';

import { createdAtPatch } from './finance-created.logic';

const REGION = 'europe-west6';

/**
 * Stamps `createdAt` on every new booking, bill and invoice. One trigger instead of a stamp in each of the
 * dozen writers (writeBooking, bank and journal imports, OCR, invoice and bill callables, bexio sync).
 * Updates keep it: the writers merge or copy the existing document. Documents older than this trigger have none.
 */
async function stampCreatedAt(event: FirestoreEvent<QueryDocumentSnapshot | undefined, Record<string, string>>, what: string): Promise<void> {
  const snap = event.data;
  if (!snap) return;
  const patch = createdAtPatch(snap.data(), snap.createTime.toDate());
  if (!patch) return;
  try {
    await snap.ref.update(patch);
  } catch (e) {
    // deleted again before the trigger ran: nothing to stamp
    logger.warn(`stampCreatedAt: ${what} ${snap.id} not stamped`, { detail: String((e as Error)?.message ?? e).slice(0, 300) });
  }
}

export const onBookingCreated = onDocumentCreated({ document: `${BookingCollection}/{id}`, region: REGION }, (e) => stampCreatedAt(e, 'booking'));
export const onBillCreated = onDocumentCreated({ document: `${BillCollection}/{id}`, region: REGION }, (e) => stampCreatedAt(e, 'bill'));
export const onInvoiceCreated = onDocumentCreated({ document: `${InvoiceCollection}/{id}`, region: REGION }, (e) => stampCreatedAt(e, 'invoice'));
