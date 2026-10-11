import type { Firestore, Transaction } from 'firebase-admin/firestore';

import { nextBookingNo } from '@okr/shared-util-functions';

const BOOKING_COLLECTION = 'bookings';

/**
 * The `date` bounds of one calendar year as a half-open string range: `[ '2026', '2027' )` holds every
 * StoreDate starting with `2026` — the same set `nextBookingNo` selects with `startsWith`.
 */
export function bookingYearRange(year: number): { from: string; to: string } {
  return { from: String(year), to: String(year + 1) };
}

/**
 * Next booking number of `year` in the books `accountingTenantId`, read inside the caller's transaction.
 *
 * Reads ONE document — the highest-numbered booking of that year — instead of the whole ledger, which
 * cost ~11'000 reads and ~2 s per booking for scs. Backed by the composite index
 * `bookings: accountingTenantId ↑, bookingNo ↓, date ↓`. Undated and unnumbered bookings never reach
 * the top of that index, exactly as `nextBookingNo` ignores them.
 */
export async function allocateBookingNo(db: Firestore, tx: Transaction, accountingTenantId: string, year: number): Promise<number> {
  const { from, to } = bookingYearRange(year);
  const top = await tx.get(
    db.collection(BOOKING_COLLECTION)
      .where('accountingTenantId', '==', accountingTenantId)
      .where('date', '>=', from)
      .where('date', '<', to)
      .orderBy('bookingNo', 'desc')
      .limit(1),
  );
  return nextBookingNo(top.docs.map(s => s.data() as { date?: string; bookingNo?: number }), year);
}
