import type { DocumentModel } from '@okr/shared-models';

/** Mean stars, one decimal; 0 when nobody rated. */
export function averageStars(doc: Pick<DocumentModel, 'ratingCount' | 'ratingSum'>): number {
  const count = doc.ratingCount ?? 0;
  if (count <= 0) return 0;
  return Math.round(((doc.ratingSum ?? 0) / count) * 10) / 10;
}

/** A star rating: an integer 1..5. */
export function isValidRating(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;
}

/** The aggregate after one person's rating went from `before` to `after` (undefined = none). */
export function applyRatingChange(
  agg: { count: number; sum: number }, before: number | undefined, after: number | undefined,
): { count: number; sum: number } {
  if (!isValidRating(before)) before = undefined;
  if (!isValidRating(after)) after = undefined;
  let count = agg.count;
  let sum = agg.sum;
  if (before !== undefined) { count -= 1; sum -= before; }
  if (after !== undefined) { count += 1; sum += after; }
  return { count: Math.max(0, count), sum: Math.max(0, sum) };
}
