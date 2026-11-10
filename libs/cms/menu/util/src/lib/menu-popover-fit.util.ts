/** Gap kept between a context-menu popover and the edge of the screen, in px. */
export const POPOVER_EDGE_MARGIN = 8;

/**
 * How far a popover's content box must move sideways so it lies inside the viewport.
 *
 * Why this exists: the apps size every context-menu popover with
 * `ion-popover:has(okr-menu) { --width: max-content }` (each app's `styles.scss`). Ionic measures
 * the content ONCE, at the start of its enter animation, and writes a fixed `left` from that
 * width. An intrinsic width measures near 0 at that moment (Ionic says so itself in
 * `popover.ios.css`, `.select-popover-rich-content`) or too narrow when the row labels are
 * translated a moment later, so the popover is placed for a box that then grows to the right
 * and out of the screen: either nothing is visible (the «…» seems dead) or only a white strip.
 *
 * @param left current left edge of the content box, in layout px, INCLUDING `currentOffset`
 * @param width current width of the content box, in layout px
 * @param viewportWidth width of the viewport, in layout px
 * @param currentOffset the offset already applied (Ionic's `--offset-x`)
 * @param margin gap to keep from both edges
 * @returns the new value for `--offset-x`, in px (0 when no shift is needed)
 */
export function popoverOffsetX(
  left: number,
  width: number,
  viewportWidth: number,
  currentOffset = 0,
  margin = POPOVER_EDGE_MARGIN,
): number {
  // where Ionic put it, without our shift: a shrinking box may move back towards it
  const baseLeft = left - currentOffset;
  let targetLeft = Math.min(baseLeft, viewportWidth - margin - width);
  // wider than the screen: keep the start (icons, first letters) visible
  targetLeft = Math.max(targetLeft, margin);
  // never pull a box that already fits further right than Ionic placed it
  if (baseLeft >= margin && targetLeft > baseLeft) targetLeft = baseLeft;
  return targetLeft - baseLeft;
}
