import { isValidRating } from '@okr/content-learning-util';

/** 'document.<key>' -> '<key>'; anything else (or an empty key) -> undefined. */
export function docKeyOfRating(parentKey: unknown): string | undefined {
  if (typeof parentKey !== 'string' || !parentKey.startsWith('document.')) return undefined;
  const key = parentKey.slice('document.'.length);
  // A dotted key is refused, exactly like the rules' `document\\.[^.]+` binding.
  return key === '' || key.includes('.') ? undefined : key;
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

/** The doc keys whose aggregate a rating write may change: before and after, deduplicated. */
export function ratingDocKeysToRefresh(
  before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined,
): string[] {
  const keys = new Set<string>();
  for (const data of [before, after]) {
    const key = docKeyOfRating(data?.['parentKey']);
    if (key) keys.add(key);
  }
  return [...keys];
}

/**
 * The new aggregate of one document, or undefined when nothing may be written (document missing).
 * Only live ratings that share a tenant with the document count (defence in depth: the rules
 * already bind a rating to a document of the caller's tenant).
 */
export function aggregateForDoc(
  doc: { tenants?: unknown } | undefined, ratings: readonly Record<string, unknown>[],
): { count: number; sum: number } | undefined {
  if (!doc) return undefined;
  const docTenants = Array.isArray(doc.tenants) ? (doc.tenants as unknown[]) : [];
  const counted = ratings.filter((r) => {
    if (r['isArchived'] === true) return false;
    const t = r['tenants'];
    return Array.isArray(t) && t.some((x) => docTenants.includes(x));
  });
  return recomputeRatingAggregate(counted.map((r) => r['stars']));
}
