let contextMenuSeq = 0;

/**
 * A DOM id for an `ion-popover` trigger, unique per call.
 *
 * Ionic binds a popover to its trigger once, via a global `document.getElementById(trigger)`, and
 * keeps previous pages in the DOM. A fixed or data-derived id (`c_tasks_${listId}`) therefore
 * repeats as soon as the same list is open twice in the stack, and the new popover binds to the
 * HIDDEN page's button: the visible button shows, but a click does nothing. Call this once per
 * component instance (as a field initializer) and bind the result to both `id` and `trigger`.
 * `pnpm check-popover-triggers` rejects every trigger that does not come from here.
 */
export function contextMenuId(prefix: string): string {
  return `${prefix}_${++contextMenuSeq}`;
}
