import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { BillCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { refuse } from '../invoice/invoice-context';
import { withoutUndefined } from '../invoice/invoice.logic';
import { billAfterPaymentRemoval, BillLike, billPaymentNote, StoredBillPayment, withoutNoteLine } from './bill-payment.logic';
import { isPeriodOpen, loadBillConfig, loadOwnBill } from './bill-context';
import { touchedPeriodKeys } from '../booking/period-lock';

const REGION = 'europe-west6';
const CF_NAME = 'unlinkBillPayment';
const BOOKING_COLLECTION = 'bookings';

interface UnlinkBillPaymentData { billKey?: string; bookingKey?: string; }

/**
 * Removes a linked payment from a bill (spec 1.85 B8): the booking stays in the journal, the bill opens
 * again. A payment okr posted itself (`bill-{key}-pay-…`) is not unlinked — its booking is deleted in
 * the journal, and `writeBooking` then removes the payment. Idempotent: a payment that is already gone
 * returns the bill as it is.
 */
export const unlinkBillPayment = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<UnlinkBillPaymentData>): Promise<{ state: string; payments: StoredBillPayment[] }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const { billKey, bookingKey } = request.data ?? {};
    if (typeof billKey !== 'string' || !billKey.trim()) throw new HttpsError('invalid-argument', 'billKey is required');
    if (typeof bookingKey !== 'string' || !bookingKey.trim()) throw new HttpsError('invalid-argument', 'bookingKey is required');
    if (bookingKey.startsWith(`bill-${billKey}-pay-`)) {
      throw refuse('posted-payment', `payment ${bookingKey} was booked by okr — delete its booking in the journal instead`);
    }

    const db = getFirestore();
    const billRef = db.collection(BillCollection).doc(billKey);
    const pre = await loadOwnBill(db, tenantId, billKey);
    const accountingTenantId = String(pre['accountingTenantId'] ?? '');
    const config = await loadBillConfig(db, tenantId, billKey, accountingTenantId);
    const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);

    const result = await db.runTransaction(async (tx) => {
      const bill = (await tx.get(billRef)).data();
      if (!bill) throw new HttpsError('not-found', `bill ${billKey} not found`);
      const booking = (await tx.get(bookingRef)).data();
      const like: BillLike = {
        state: String(bill['state'] ?? ''), totalAmount: bill['totalAmount'] as BillLike['totalAmount'],
        payments: (bill['payments'] as BillLike['payments']) ?? [], accountingTenantId: String(bill['accountingTenantId'] ?? ''),
      };
      const after = billAfterPaymentRemoval(like, bookingKey);
      if (!after) return { state: like.state, payments: (like.payments ?? []) as StoredBillPayment[] };
      // the note is removed only in an open period (GebüV: closed books stay as they are)
      const bookingPeriodOpen = booking
        ? await isPeriodOpen(db, tx, touchedPeriodKeys(accountingTenantId, [String(booking['date'] ?? '')], fiscalYearStart))
        : false;
      tx.update(billRef, { payments: after.payments, state: after.state, paymentDate: after.paymentDate });
      if (booking && bookingPeriodOpen) {
        const notes = withoutNoteLine(String(booking['notes'] ?? ''), billPaymentNote(String(bill['billId'] ?? ''), String(bill['title'] ?? '')));
        tx.update(bookingRef, withoutUndefined({ notes }));
      }
      return { state: after.state, payments: after.payments };
    });
    logger.info(`${CF_NAME}: unlinked ${bookingKey} from bill ${billKey} (tenant=${tenantId})`);
    return result;
  },
);
