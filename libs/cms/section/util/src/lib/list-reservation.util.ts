/**
 * Height a dashboard list section reserves before its data has arrived.
 *
 * Why this exists: the tasks/events/invitations sections used to render their empty state
 * while the Firestore query was still running, then grow when the rows landed — a layout shift
 * of 0.136 on the dashboard, landing ~2.3 s after first paint (perf-baselines, 2026-09-03).
 * Reserving the space up front keeps the card the same height in all three states
 * (loading, empty, loaded), so nothing below it moves.
 *
 * The reservation is deliberately COMPACT, not an upper bound: rows measured live on the
 * dashboard are 48–52 px when they don't wrap, but a task row with tags and a long name
 * reaches 117 px. Reserving for the tallest case (5 × 117 px) would leave ~470 px of empty
 * card on a phone. A compact reservation removes the shift for uniform rows and leaves only
 * a small residual where rows wrap — CLS scoring is not all-or-nothing (0.05 already
 * scores ~0.95), so that trade is the right one.
 */

/** Compact ion-item height on the dashboard, measured live (events rows 52 px, chat rows 48 px). */
export const SECTION_LIST_ROW_HEIGHT_PX = 52;

/** Rows to reserve when the section has no configured cap (maxItems/maxEvents undefined = show all). */
export const SECTION_LIST_DEFAULT_ROWS = 3;

/**
 * Returns the min-height in pixels that a list section's content area should reserve.
 * @param maxItems the section's configured row cap; undefined, zero, negative or non-finite
 *                 values fall back to SECTION_LIST_DEFAULT_ROWS
 * @param rowHeightPx height of one compact row
 * @param defaultRows rows to reserve when maxItems is not usable
 */
export function getReservedListHeightPx(
  maxItems: number | undefined,
  rowHeightPx = SECTION_LIST_ROW_HEIGHT_PX,
  defaultRows = SECTION_LIST_DEFAULT_ROWS,
): number {
  const rows = maxItems !== undefined && Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : defaultRows;
  return rows * rowHeightPx;
}
