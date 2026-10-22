/**
 * Fractional order keys for the blocks of a footprint (spec 1.113 §5.2): a new block gets a key
 * between its neighbours, so two authors inserting at the same time never rewrite each other's
 * order. Base-62 digits in ASCII order; a key never ends in the lowest digit, so there is always
 * room below it.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

function midpoint(a: string, b: string | undefined): string {
  if (b !== undefined) {
    let n = 0;
    while ((a[n] ?? DIGITS[0]) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== undefined ? DIGITS.indexOf(b[0]) : BASE;
  if (digitB - digitA > 1) return DIGITS[Math.round((digitA + digitB) / 2)];
  if (b !== undefined && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), undefined);
}

/** A key strictly between `before` and `after`; either bound may be missing. */
export function orderBetween(before?: string, after?: string): string {
  return midpoint(before ?? '', after);
}

/** By `order`, then by `okey`; items without an order go last. */
export function sortByOrder<T extends { order?: string; okey: string }>(items: T[]): T[] {
  return [...items].sort((x, y) => {
    if (x.order !== y.order) {
      if (x.order === undefined) return 1;
      if (y.order === undefined) return -1;
      return x.order < y.order ? -1 : 1;
    }
    return x.okey < y.okey ? -1 : x.okey > y.okey ? 1 : 0;
  });
}
