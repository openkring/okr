import { isValidRating } from '@okr/content-learning-util';

/** 'document.<key>' -> '<key>'; anything else (or an empty key) -> undefined. */
export function docKeyOfRating(parentKey: unknown): string | undefined {
  if (typeof parentKey !== 'string' || !parentKey.startsWith('document.')) return undefined;
  const key = parentKey.slice('document.'.length);
  return key === '' ? undefined : key;
}

/**
 * The aggregate over every rating of one document. The trigger recomputes instead of applying a
 * delta: Firestore triggers are delivered at-least-once, and a recompute is exact and idempotent.
 * Invalid stars (not an integer 1..5) are ignored.
 */
export function recomputeRatingAggregate(stars: readonly unknown[]): { count: number; sum: number } {
  let count = 0;
  let sum = 0;
  for (const s of stars) {
    if (!isValidRating(s)) continue;
    count += 1;
    sum += s;
  }
  return { count, sum };
}
