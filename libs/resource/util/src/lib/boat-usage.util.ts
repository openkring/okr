/**
 * `ResourceModel.usage` (rboat only) carries the boat's allocation (rboat_usage item name).
 *
 * Format: a comma-separated list of items.
 *  - `YYYY:value` — the allocation for that season, e.g. `2026:bs`
 *  - `YYYY:`      — that season, but unallocated: the boat shows in the leftmost column
 *  - `value`      — a bare item, the default used for every year without its own entry
 *
 * A legacy plain value (`'breitensport'`) is therefore already valid: it is the default.
 * Example: `'bs,2025:ls2,2026:ls1'` → 2025→ls2, 2026→ls1, any other year→bs.
 *
 * A year with NO entry and NO bare default means the boat is not part of that season's
 * Bootseinteilung at all — which is why getUsageForYear returns `undefined` rather than ''.
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
      // an EMPTY value is meaningful ('2026:' = in the table, unallocated) — keep it
      parsed.byYear.set(year, rest.join(':').trim());
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
 * The allocation that applies in `year`: the year's own entry, else the bare default.
 *
 * @returns the rboat_usage item name, '' if the boat takes part in that season but is
 * unallocated, or `undefined` if it is not part of that season's grid at all. There is no
 * reaching to a neighbouring year — a missing season means missing, not "the same as before".
 */
export function getUsageForYear(usage: string | undefined, year: number): string | undefined {
  const { fallback, byYear } = parseUsage(usage);
  const exact = byYear.get(year);
  if (exact !== undefined) return exact;
  return fallback || undefined;
}

/**
 * Set the allocation for `year` and the seasons that follow it, leaving earlier ones exactly as
 * they are. Both writers use this: the boat edit modal (year = the current season) and a drag &
 * drop in the grid (year = the selected season).
 *
 * Written as explicit per-year entries rather than by repointing the bare default, which
 * applies to past seasons too and would rewrite history. `PLANNING_WINDOW` bounds it: that is as
 * far as the grid and the Bootsstrategie look ahead, and a plan further out is not planning.
 * An empty `value` writes `YYYY:` — in the table, unallocated.
 */
export function setUsageFromYear(usage: string | undefined, year: number, value: string): string {
  const parsed = parseUsage(usage);
  for (const entry of [...parsed.byYear.keys()]) {
    if (entry >= year) parsed.byYear.delete(entry);
  }
  for (let season = year; season <= year + PLANNING_WINDOW; season++) {
    parsed.byYear.set(season, value);
  }
  return serializeUsage(parsed);
}

/**
 * How many seasons beyond the edited one a Bootseinteilung edit reaches forward — the grid's
 * year range and the Bootsstrategie outlook. Used by setUsageFromYear and by the slot labels.
 */
export const PLANNING_WINDOW = 5;

/** Key of one cell of the Bootseinteilung grid inside `BoatTargetModel.targets`. */
export function boatTargetKey(year: number, usage: string, type: string): string {
  return `${year}|${usage}|${type}`;
}

/**
 * What a slot label in `BoatTargetModel.labels` is attached to, for one season.
 *
 *  - `boat` — the boat itself, by its okey. Follows it wherever it is allocated, in any year.
 *  - `slot` — a FREE slot of one cell, numbered among that cell's free slots only.
 *
 * Numbering free slots independently of the boats is what makes a label survive a season with
 * a different boat count: an earlier scheme keyed on the row index, so propagating a label
 * forward landed it under a boat (hiding it) or past the last rendered row (losing it).
 */
export type BoatLabelRef =
  | { kind: 'boat'; year: number; boatKey: string }
  | { kind: 'slot'; year: number; usage: string; type: string; slot: number };

/** Key of one label inside `BoatTargetModel.labels`. */
export function boatLabelKey(ref: BoatLabelRef): string {
  return ref.kind === 'boat'
    ? `${ref.year}|boat|${ref.boatKey}`
    : `${boatTargetKey(ref.year, ref.usage, ref.type)}|${ref.slot}`;
}

/** The inverse of boatLabelKey; undefined for a key that is neither shape (legacy data). */
export function parseBoatLabelKey(key: string): BoatLabelRef | undefined {
  const parts = key.split('|');
  const year = Number(parts[0]);
  if (!Number.isInteger(year)) return undefined;
  if (parts.length === 3 && parts[1] === 'boat') return { kind: 'boat', year, boatKey: parts[2] };
  if (parts.length !== 4) return undefined;
  const slot = Number(parts[3]);
  return Number.isInteger(slot) ? { kind: 'slot', year, usage: parts[1], type: parts[2], slot } : undefined;
}

/** The same label one season later — how a label is propagated forward. */
export function boatLabelRefIn(ref: BoatLabelRef, year: number): BoatLabelRef {
  return { ...ref, year };
}

/** The maximal weight of `ResourceModel.load` ('from - to', e.g. '65 - 80'), undefined if none. */
export function getMaxLoad(load?: string): number | undefined {
  const numbers = (load ?? '').match(/\d+([.,]\d+)?/g);
  return numbers?.length ? Number(numbers[numbers.length - 1].replace(',', '.')) : undefined;
}

/**
 * Flags shown right-aligned behind a boat name in the Bootseinteilung, lowercase and
 * without separator (e.g. 'lp'): `l` light crew (max load ≤ 75kg) or `s` heavy crew
 * (max load > 80kg), `p` not owned by the club.
 */
export function getBoatSuffix(load: string | undefined, isPrivate: boolean): string {
  const max = getMaxLoad(load);
  const weight = max === undefined ? '' : max <= 75 ? 'l' : max > 80 ? 's' : '';
  return weight + (isPrivate ? 'p' : '');
}
