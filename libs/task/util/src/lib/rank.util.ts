/**
 * Fractional (lexicographic) ranking for the Kanban board.
 *
 * A rank is a base-62 string. Ranks are compared with plain string comparison, and there is
 * always room to mint a new rank strictly between any two existing ones. That is the whole
 * point: moving a card is a single document write instead of an O(n) rewrite of every sibling
 * in the column.
 *
 * Invariant: a rank must never end in the smallest digit ('0'). Otherwise there would be no
 * rank below it, and `rankBetween('', thatRank)` would be unsatisfiable. Both functions below
 * uphold this on output and assert it on input.
 */
export const RANK_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const RANK_BASE = RANK_DIGITS.length; // 62

/**
 * The midpoint of two ranks. `upper === undefined` means "no upper bound".
 * Adapted from the fractional-indexing algorithm (Figma / David Greenspan).
 */
function midpoint(lower: string, upper: string | undefined): string {
  if (upper !== undefined && lower >= upper) {
    throw new Error(`rank.util.midpoint: lower (${lower}) must be strictly below upper (${upper}).`);
  }
  if (lower.endsWith('0') || (upper !== undefined && upper.endsWith('0'))) {
    throw new Error(`rank.util.midpoint: a rank must never end in '0' (lower=${lower}, upper=${upper}).`);
  }

  if (upper !== undefined) {
    // strip the common prefix and recurse on the remainder
    let n = 0;
    while ((lower[n] ?? '0') === upper[n]) n++;
    if (n > 0) {
      return upper.slice(0, n) + midpoint(lower.slice(n), upper.slice(n));
    }
  }

  const digitLower = lower.length > 0 ? RANK_DIGITS.indexOf(lower[0]) : 0;
  const digitUpper = upper !== undefined ? RANK_DIGITS.indexOf(upper[0]) : RANK_BASE;

  if (digitUpper - digitLower > 1) {
    // there is a free digit between them
    return RANK_DIGITS[Math.round(0.5 * (digitLower + digitUpper))];
  }
  if (upper !== undefined && upper.length > 1) {
    // the digits are consecutive but upper has more to give
    return upper.slice(0, 1);
  }
  // consecutive digits and no room above: keep lower's digit and descend
  return RANK_DIGITS[digitLower] + midpoint(lower.slice(1), undefined);
}

/**
 * Mint a rank strictly between `lower` and `upper`.
 * An empty string means "unbounded" on that side ('' , '' -> the middle of the space).
 */
export function rankBetween(lower = '', upper = ''): string {
  return midpoint(lower, upper.length === 0 ? undefined : upper);
}

/**
 * The rank of the 0-based position `index` in a freshly-ranked column.
 * Used to backfill a column that has no ranks yet (in its current dueDate order).
 * Strictly increasing, evenly spaced, and never ends in '0'.
 */
export function rankForIndex(index: number): string {
  let value = (index + 1) * 64;   // stride 64 leaves room to insert between neighbours
  let rank = '';
  while (value > 0) {
    rank = RANK_DIGITS[value % RANK_BASE] + rank;
    value = Math.floor(value / RANK_BASE);
  }
  // fixed width -> lexicographic order equals numeric order
  rank = rank.padStart(6, '0');
  // uphold the no-trailing-zero invariant; '…10' -> '…101' still sorts above '…0z' and below '…11'
  return rank.endsWith('0') ? rank + '1' : rank;
}
