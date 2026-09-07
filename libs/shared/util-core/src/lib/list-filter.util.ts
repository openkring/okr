/** The filters a list toolbar (okr-list-filter) can show, in the order they appear. */
export const LIST_FILTERS = ['search', 'tags', 'categories', 'types', 'years', 'states', 'strings', 'view'] as const;
export type ListFilterName = typeof LIST_FILTERS[number];

/**
 * Parse a `?filters=search,tags` query parameter into the filters a list toolbar shows.
 *
 * Leaving the parameter off keeps the full toolbar — a plain list link must behave exactly as
 * before. A value listing only understood names narrows the toolbar to those (the list still
 * only shows the filters it actually feeds with data); unknown entries are dropped rather than
 * failing the whole parameter, so a typo in a hand-written link degrades gracefully. A value
 * that contains nothing understood at all (`?filters=nonsense`) would leave an empty toolbar,
 * so it falls back to the full set.
 *
 * `?filters=none` is the one way to ask for no filter row at all.
 */
export function parseListFilters(raw?: string | null): ListFilterName[] {
  if (!raw) return [...LIST_FILTERS];
  const entries = raw.split(',').map((entry) => entry.trim().toLowerCase());
  if (entries.includes('none')) return [];
  const names = entries.filter((entry): entry is ListFilterName =>
    (LIST_FILTERS as readonly string[]).includes(entry));
  return names.length > 0 ? [...new Set(names)] : [...LIST_FILTERS];
}
