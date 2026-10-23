import type { DocumentModel } from '@okr/shared-models';

/** Mean stars, one decimal; 0 when nobody rated. */
export function averageStars(doc: Pick<DocumentModel, 'ratingCount' | 'ratingSum'>): number {
  const count = doc.ratingCount ?? 0;
  if (count <= 0) return 0;
  return Math.round(((doc.ratingSum ?? 0) / count) * 10) / 10;
}

/** The aggregate after one person's rating went from `before` to `after` (undefined = none). */
export function applyRatingChange(
  agg: { count: number; sum: number }, before: number | undefined, after: number | undefined,
): { count: number; sum: number } {
  let count = agg.count;
  let sum = agg.sum;
  if (before !== undefined) { count -= 1; sum -= before; }
  if (after !== undefined) { count += 1; sum += after; }
  return { count: Math.max(0, count), sum: Math.max(0, sum) };
}
