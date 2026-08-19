/**
 * `ResourceModel.usage` (rboat only) carries the boat's allocation (rboat_usage item name).
 *
 * Format: a comma-separated list of items.
 *  - `YYYY:value` — the allocation for that season, e.g. `2026:bs`
 *  - `value`      — a bare item, the default used for every year without its own entry
 *
 * A legacy plain value (`'breitensport'`) is therefore already valid: it is the default.
 * Example: `'bs,2025:ls2,2026:ls1'` → 2025→ls2, 2026→ls1, any other year→bs.
 */

interface ParsedUsage {
  /** bare item, '' if none */
  fallback: string;
  /** year → value */
  byYear: Map<number, string>;
}

function parseUsage(usage: string | undefined): ParsedUsage {
  const parsed: ParsedUsage = { fallback: '', byYear: new Map<number, string>() };
  for (const raw of (usage ?? '').split(',')) {
    const item = raw.trim();
    if (!item) continue;
    const [head, ...rest] = item.split(':');
    const year = Number(head);
    if (rest.length > 0 && Number.isInteger(year)) {
      const value = rest.join(':').trim();
      if (value) parsed.byYear.set(year, value);
    } else if (!parsed.fallback) {
      parsed.fallback = item;
    }
  }
  return parsed;
}

function serializeUsage(parsed: ParsedUsage): string {
  const years = [...parsed.byYear.keys()].sort((a, b) => a - b);
  return [
    ...(parsed.fallback ? [parsed.fallback] : []),
    ...years.map(year => `${year}:${parsed.byYear.get(year)}`),
  ].join(',');
}

/**
 * The allocation that applies in `year`: the year's own entry, else the bare default,
 * else the nearest earlier year, else the nearest later year, else ''.
 */
export function getUsageForYear(usage: string | undefined, year: number): string {
  const { fallback, byYear } = parseUsage(usage);
  const exact = byYear.get(year);
  if (exact) return exact;
  if (fallback) return fallback;
  const years = [...byYear.keys()].sort((a, b) => a - b);
  // .filter().pop() rather than .findLast() — the lib build target predates ES2023.
  const earlier = years.filter(y => y < year).pop();
  return (earlier !== undefined ? byYear.get(earlier) : byYear.get(years[0])) ?? '';
}

/**
 * Set the allocation for a single year, leaving every other year (and the bare default) intact.
 * An empty `value` removes the year's entry.
 */
export function setUsageForYear(usage: string | undefined, year: number, value: string): string {
  const parsed = parseUsage(usage);
  if (value) {
    parsed.byYear.set(year, value);
  } else {
    parsed.byYear.delete(year);
  }
  return serializeUsage(parsed);
}

/** Key of one cell of the Bootseinteilung grid inside `BoatTargetModel.targets`. */
export function boatTargetKey(year: number, usage: string, type: string): string {
  return `${year}|${usage}|${type}`;
}
