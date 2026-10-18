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
 *
 * The reservation applies WHILE LOADING only. Once the rows are in, the card shrinks to its
 * content (a fixed 5-row reservation left ~200 px of empty card under a single task). To keep
 * that shrink from becoming the next layout shift, the reservation is sized from the number of
 * rows the same section showed last time on this device (`lastRowCount`), capped by maxItems —
 * repeat visits reserve exactly what arrives; only a first visit falls back to the cap.
 *
 * The reservation is applied to the LIST AREA only (a wrapper around spinner / empty state /
 * rows); the more-button sits after that wrapper. Reserving the whole card content instead
 * let the button move inside a container that kept its size (CLS 0.11 on 2026-09-06).
 */

/** Compact ion-item height on the dashboard, measured live (events rows 52 px, chat rows 48 px). */
export const SECTION_LIST_ROW_HEIGHT_PX = 52;

/** Rows to reserve when the section has no configured cap (maxItems/maxEvents undefined = show all). */
export const SECTION_LIST_DEFAULT_ROWS = 3;

export interface ReservedListHeightOptions {
  rowHeightPx?: number;
  defaultRows?: number;
  /** Rows the section rendered on its last load (0 = empty state, reserved as one row). */
  lastRowCount?: number;
}

/**
 * Returns the min-height in pixels that a list section's list area should reserve.
 * @param maxItems the section's configured row cap; undefined, zero, negative or non-finite
 *                 values fall back to defaultRows
 * @param options row height, default row count and the remembered row count of the last load
 */
export function getReservedListHeightPx(maxItems: number | undefined, options: ReservedListHeightOptions = {}): number {
  const rowHeightPx = options.rowHeightPx ?? SECTION_LIST_ROW_HEIGHT_PX;
  const defaultRows = options.defaultRows ?? SECTION_LIST_DEFAULT_ROWS;
  const capRows = maxItems !== undefined && Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : defaultRows;
  const last = options.lastRowCount;
  const rows = last !== undefined && Number.isFinite(last) && last >= 0 ? Math.min(Math.max(Math.floor(last), 1), capRows) : capRows;
  return rows * rowHeightPx;
}

const ROW_COUNT_STORAGE_PREFIX = 'okr.sectionRows.';

/**
 * Reads the row count a list section rendered on its last load on this device.
 * Returns undefined when nothing is stored or storage is unavailable (private mode, SSR).
 */
export function readListRowCount(sectionKey: string | undefined): number | undefined {
  if (!sectionKey) return undefined;
  try {
    const raw = globalThis.localStorage?.getItem(ROW_COUNT_STORAGE_PREFIX + sectionKey);
    if (raw === null || raw === undefined) return undefined;
    const count = Number(raw);
    return Number.isFinite(count) && count >= 0 ? count : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the row count a list section rendered, for the next load's reservation. */
export function writeListRowCount(sectionKey: string | undefined, count: number): void {
  if (!sectionKey) return;
  try {
    globalThis.localStorage?.setItem(ROW_COUNT_STORAGE_PREFIX + sectionKey, String(count));
  } catch {
    // storage blocked or full — the next load falls back to the configured cap
  }
}
