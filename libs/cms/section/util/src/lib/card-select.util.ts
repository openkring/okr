/** A selector entry with its translated label. */
export interface LabelledItem<T> {
  item: T;
  label: string;
}

/**
 * Pairs every item with its translated label (the raw name while a label is missing or still
 * loading) and sorts by that label — case- and accent-insensitive, numbers in natural order,
 * using the active language's collation.
 */
export function sortByLabel<T extends { name: string }>(items: T[], labels: Record<string, string>, lang?: string): LabelledItem<T>[] {
  const collator = new Intl.Collator(lang || undefined, { sensitivity: 'base', numeric: true });
  return items
    .map(item => ({ item, label: labels[item.name] || item.name }))
    .sort((a, b) => collator.compare(a.label, b.label) || collator.compare(a.item.name, b.item.name));
}
