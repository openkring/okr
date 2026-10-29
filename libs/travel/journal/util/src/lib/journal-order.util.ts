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

/**
 * A key strictly between `before` and `after`; either bound may be missing. Throws a RangeError
 * when `before >= after`: two blocks appended concurrently can share a key (sortByOrder then breaks
 * the tie by okey), and no key fits between them — the caller must pick distinct neighbours.
 */
export function orderBetween(before?: string, after?: string): string {
  if (before !== undefined && after !== undefined && before >= after) {
    throw new RangeError(`orderBetween: '${before}' is not below '${after}'`);
  }
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

/**
 * New `order` values for the blocks that must move so that `keys` reads strictly increasing. The
 * longest run of blocks already in the right order stays untouched; every other block gets a key
 * between its kept neighbours, so a drag rewrites one block and two authors reordering different
 * blocks rarely collide. Keys without a block are ignored.
 */
export function reorderedOrders(blocks: { key: string; order: string }[], keys: string[]): Record<string, string> {
  const orderOf = new Map(blocks.map((b) => [b.key, b.order]));
  const seq = keys.filter((k) => orderOf.has(k));
  const orders = seq.map((k) => orderOf.get(k) as string);

  // longest strictly increasing subsequence (O(n²): a footprint holds a handful of blocks)
  const length: number[] = [];
  const prev: number[] = [];
  let best = -1;
  for (let i = 0; i < seq.length; i++) {
    length[i] = 1;
    prev[i] = -1;
    for (let j = 0; j < i; j++) {
      if (orders[j] < orders[i] && length[j] + 1 > length[i]) { length[i] = length[j] + 1; prev[i] = j; }
    }
    if (best < 0 || length[i] > length[best]) best = i;
  }
  const kept = new Set<number>();
  for (let i = best; i >= 0; i = prev[i]) kept.add(i);

  const result: Record<string, string> = {};
  let lower: string | undefined;
  for (let i = 0; i < seq.length; i++) {
    if (kept.has(i)) { lower = orders[i]; continue; }
    let upper: string | undefined;
    for (let j = i + 1; j < seq.length; j++) if (kept.has(j)) { upper = orders[j]; break; }
    lower = orderBetween(lower, upper);
    result[seq[i]] = lower;
  }
  return result;
}
