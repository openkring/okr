/** The filters the person list can show, in the order they appear in the filter toolbar. */
export const PERSON_FILTERS = ['search', 'tags', 'gender', 'photo'] as const;
export type PersonFilterName = typeof PERSON_FILTERS[number];

/**
 * Parse a `?filters=search,tags` query parameter into the filters the list shows.
 *
 * Leaving the parameter off keeps the full toolbar — a plain `/person/all/c-persons` link must
 * behave exactly as before. A value listing only understood names narrows the toolbar to those;
 * unknown entries are dropped rather than failing the whole parameter, so a typo in a
 * hand-written link degrades gracefully. A value that contains nothing understood at all
 * (`?filters=nonsense`) would leave an empty toolbar, so it falls back to the full set.
 *
 * `?filters=none` is the one way to ask for no filter row at all.
 */
export function parsePersonFilters(raw?: string | null): PersonFilterName[] {
  if (!raw) return [...PERSON_FILTERS];
  const entries = raw.split(',').map((entry) => entry.trim().toLowerCase());
  if (entries.includes('none')) return [];
  const names = entries.filter((entry): entry is PersonFilterName =>
    (PERSON_FILTERS as readonly string[]).includes(entry));
  return names.length > 0 ? [...new Set(names)] : [...PERSON_FILTERS];
}
