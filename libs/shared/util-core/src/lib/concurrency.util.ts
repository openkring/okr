/**
 * Map `items` through `fn` with at most `limit` calls in flight; results keep input order.
 * A rejection rejects the whole call (callers that must not abort catch per item).
 * Used by the vCard import commit and the CardDAV photo fetches (spec 1.159).
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
