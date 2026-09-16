/**
 * THE PER-ROW OPT-OUT — `app-config/{tenantId}.hiddenMenuKeys`.
 *
 * A tenant may keep a feature block ENABLED and still suppress individual menu rows it
 * declares. This is the fourth visibility gate, after `tenants[]` (query level), the feature
 * block (`MenuStore.isVisible`) and `roleNeeded`.
 *
 * WHY A CONFIG FIELD RATHER THAN A DOCUMENT FIELD. Every data-level suppression is undone by
 * the next picker save of the owning block, because `planMenuOps` is additive in three
 * independent places — `needsTenant` re-adds the tenant to `tenants[]`, `missingChildren`
 * re-appends the name to the parent's `menuItems[]`, and the `isArchived` branch reactivates
 * an archived document. None of that needs `replayStructure`; a plain save does it. And the
 * first of the three does not even hide the row in the meantime: the parent still names the
 * child, so `<okr-menu>` draws the yellow «Missing:» placeholder. That combination is what
 * produced the 67 dangling child references found fleet-wide on 2026-09-16, and it is why
 * "just remove the tenant from the row" is not an opt-out but a defect.
 *
 * `app-config` is tenant-owned and is never written by the seeder, so a key held here
 * survives every save. The menu document keeps existing and keeps naming the tenant; only
 * the rendering is suppressed. Un-hiding is therefore a single-field write with nothing to
 * re-seed, which is the property the document-level approaches could not offer.
 *
 * DELIBERATELY NOT RECURSIVE. Hiding a parent hides that row, and its children become
 * unreachable through it because the parent is no longer rendered — but the children are NOT
 * themselves marked hidden. A child reachable from a second parent stays visible there, which
 * is the behaviour a name-addressed menu tree needs (`c-*` context menus are reached through
 * a route parameter, not only through their declaring parent).
 *
 * See `planning/specs/2026-09-16-menu-tenant-sentinel-design.md` §7.1 and §9.5.
 */

/** The hidden keys as a Set, for repeated lookups while rendering a tree. */
export function hiddenKeySet(hidden: string[] | undefined): Set<string> {
  return new Set(hidden ?? []);
}

/**
 * Is this catalogue menu key suppressed for the tenant?
 *
 * `undefined` and `[]` both mean "nothing hidden" — the field is absent on every
 * pre-existing `app-config` document, and that must read as the previous behaviour.
 */
export function isMenuKeyHidden(hidden: string[] | undefined, key: string): boolean {
  return (hidden ?? []).includes(key);
}

/** `hiddenMenuKeys` with `key` added — idempotent, order-stable. Mirrors `withPin`. */
export function withHiddenKey(current: string[] | undefined, key: string): string[] {
  const list = current ?? [];
  return list.includes(key) ? [...list] : [...list, key];
}

/** `hiddenMenuKeys` with `key` removed — idempotent. Mirrors `withoutPin`. */
export function withoutHiddenKey(current: string[] | undefined, key: string): string[] {
  return (current ?? []).filter(k => k !== key);
}
