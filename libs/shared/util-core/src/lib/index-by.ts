/**
 * Baut eine Nachschlage-Map über eine Liste. Ersetzt lineare `Array.find`-Suchen in Accessoren,
 * die pro Renderdurchlauf viele Male aufgerufen werden — siehe
 * planning/specs/2026-08-31-appstore-reference-data-design.md, Befund B-C.
 *
 * Einträge ohne Schlüssel werden übersprungen, damit ein `undefined`-Schlüssel nicht
 * versehentlich einen Treffer liefert.
 */
export function indexBy<T>(
  items: readonly T[] | undefined,
  key: (item: T) => string | undefined
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items ?? []) {
    const k = key(item);
    if (k) map.set(k, item);
  }
  return map;
}
