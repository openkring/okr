/**
 * Pure helpers for the treasurer's approve/reject step on `forReview` bookings
 * (see planning/specs/2026-08-01-booking-review-ui-design.md).
 *
 * They live here so the `reviewBooking` Cloud Function and its Vitest specs share one
 * implementation — the numbering rule in particular must not drift between the two.
 */

/** The subset of a booking header the numbering rule needs. */
export interface NumberedBooking {
  date?: string;      // StoreDate yyyymmdd
  bookingNo?: number;
}

/**
 * Next sequential booking number for `year`, given all bookings of one accountingTenantId.
 *
 * The sequence is per calendar year (taken from the booking's own yyyymmdd date) and never
 * reuses a number: it is `max + 1` over that year, so a gap left by a cancelled booking stays
 * a gap. Bookings of other years, undated bookings and unnumbered (`forReview`, bookingNo 0)
 * bookings do not participate.
 */
export function nextBookingNo(bookings: readonly NumberedBooking[], year: number): number {
  const prefix = String(year);
  let max = 0;
  for (const b of bookings) {
    if (!b.date?.startsWith(prefix)) continue;
    const no = b.bookingNo ?? 0;
    if (no > max) max = no;
  }
  return max + 1;
}

/**
 * Append a rejection note to a booking's existing notes, never overwriting them.
 * `dateStr` is a ViewDate (dd.mm.yyyy); `reviewer` is the treasurer's display name.
 */
export function formatRejectNote(existingNotes: string, dateStr: string, reviewer: string, reason: string): string {
  const entry = `[Abgelehnt ${dateStr}, ${reviewer.trim()}] ${reason.trim()}`;
  const existing = (existingNotes ?? '').trim();
  return existing.length > 0 ? `${existing}\n${entry}` : entry;
}

/** The subset of a booking line the balance check needs (amounts in minor units). */
export interface BalancedLine {
  debitAmount?: { amount: number } | null;
  creditAmount?: { amount: number } | null;
}

/**
 * Server-side counterpart of the client's `validateBookingBalance`: a booking is postable only
 * when debits and credits are equal AND the total is positive. A zero-sum booking of two zero
 * lines is balanced but meaningless, so it is rejected too.
 */
export function isBalanced(lines: readonly BalancedLine[]): boolean {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    debit += l.debitAmount?.amount ?? 0;
    credit += l.creditAmount?.amount ?? 0;
  }
  return debit > 0 && debit === credit;
}
