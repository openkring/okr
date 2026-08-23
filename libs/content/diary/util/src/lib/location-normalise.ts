/**
 * The 26 Swiss canton codes. A trailing one is a disambiguator ('Zürich ZH'), not part of the
 * name, so it is dropped — but only when it really is a canton: 'Rio GO' must not become 'Rio'
 * and merge with a different place.
 */
const CANTONS = new Set([
  'ag', 'ai', 'ar', 'be', 'bl', 'bs', 'fr', 'ge', 'gl', 'gr', 'ju', 'lu', 'ne',
  'nw', 'ow', 'sg', 'sh', 'so', 'sz', 'tg', 'ti', 'ur', 'vd', 'vs', 'zg', 'zh',
]);

/**
 * Country suffixes the corpus uses after a comma. Deliberately a closed list: a comma segment
 * that is NOT a country is part of the name ('Dieni, Sedrun') and must survive.
 */
const COUNTRIES = new Set([
  'switzerland', 'schweiz', 'suisse', 'italy', 'italia', 'italien', 'france', 'frankreich',
  'germany', 'deutschland', 'austria', 'oesterreich', 'spain', 'spanien', 'espana',
]);

/** German umlaut folding — 'ü' becomes 'ue', not 'u', so Zürich and Zurich do not split. */
const FOLD: Record<string, string> = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue', 'ß': 'ss',
};

/**
 * The comparison form of a free-text location. Pure, and the SINGLE key both sides use: the
 * seeding writes `aliases/<tenant>__location__<this>` and the resolver reads it back by the
 * same call. Two implementations would silently stop matching.
 */
export function normaliseLocationLabel(raw: string): string {
  const folded = [...raw].map((c) => FOLD[c] ?? c).join('');

  // Strip a trailing country segment, but only the LAST one and only if it is a known country.
  const segments = folded.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    const last = segments[segments.length - 1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (COUNTRIES.has(last)) segments.pop();
  }

  const slug = segments.join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Strip trailing canton codes, after slugging so 'Stäfa ZH' and 'Staefa-zh' behave alike.
  // A loop (not a single pop) so repeated trailing canton-like tokens are all removed and the
  // result is stable under re-application — normaliseLocationLabel must be idempotent, since
  // it is the single lookup key both the seeding and the resolver side rely on.
  const parts = slug.split('-');
  while (parts.length > 1 && CANTONS.has(parts[parts.length - 1])) parts.pop();
  return parts.join('-');
}
