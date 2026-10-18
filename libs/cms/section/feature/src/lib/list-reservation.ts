import { Signal, computed, effect } from '@angular/core';

import { getReservedListHeightPx, readListRowCount, writeListRowCount } from '@okr/cms-section-util';

/**
 * The min-height a dashboard list section's list area reserves (see list-reservation.util).
 * Reserved while loading only — sized from the rows this section showed on its last load —
 * and undefined afterwards, so the loaded card fits its content.
 * Must be called in an injection context (it registers the effect that remembers the row count).
 * @param sectionKey the section's okey, the key the row count is remembered under
 * @param maxItems the section's configured row cap
 * @param isLoading the store's loading state
 * @param rowCount the number of rows currently rendered
 */
export function reservedListHeight(
  sectionKey: Signal<string | undefined>,
  maxItems: Signal<number | undefined>,
  isLoading: Signal<boolean>,
  rowCount: Signal<number>,
): Signal<number | undefined> {
  // An idle resource (params not ready yet) also reports isLoading=false with no rows; only a
  // count observed after a real load is worth remembering.
  let hasLoaded = false;
  effect(() => {
    if (isLoading()) { hasLoaded = true; return; }
    const count = rowCount();
    if (hasLoaded) writeListRowCount(sectionKey(), count);
  });
  return computed(() => isLoading()
    ? getReservedListHeightPx(maxItems(), { lastRowCount: readListRowCount(sectionKey()) })
    : undefined);
}
