export interface SelectedBooksInput {
  /** books of the current or last visited accounting route ('' = none) */
  routeBooks: string;
  /** last explicit choice remembered in this browser ('' = none) */
  storedChoice: string;
  /** appConfig().defaultAccountingTenantId ('' = the app has no books) */
  defaultBooks: string;
  /** accounting-configs of the app tenant; [] = not loaded yet or none created */
  available: string[];
}

/**
 * Which books the accounting navigation shows (spec 1.100 §4.2). Order: route, stored choice,
 * default. A stored choice must be in `available`; while that list is empty only the route and the
 * default are trusted. There is deliberately NO tenantId input: the app tenant is never the books.
 */
export function resolveSelectedBooks(input: SelectedBooksInput): string {
  const { routeBooks, storedChoice, defaultBooks, available } = input;
  if (available.length === 0) return routeBooks || defaultBooks;
  for (const candidate of [routeBooks, storedChoice, defaultBooks]) {
    if (candidate && available.includes(candidate)) return candidate;
  }
  return routeBooks || defaultBooks;
}
