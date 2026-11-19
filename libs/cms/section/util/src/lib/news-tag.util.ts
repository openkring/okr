/**
 * News of one tag (spec 1.165 NW2): an article belongs to a tag when its comma-separated `tags`
 * contain it (case-insensitive, trimmed). An empty tag keeps every article — the news section of a
 * group page carries the group key, every other news section none.
 */
export function hasNewsTag(tags: string | undefined, tag: string | undefined): boolean {
  const wanted = (tag ?? '').trim().toLowerCase();
  if (!wanted) return true;
  return (tags ?? '').split(',').some(t => t.trim().toLowerCase() === wanted);
}

export function filterNewsByTag<T extends { tags?: string }>(articles: T[], tag: string | undefined): T[] {
  return articles.filter(a => hasNewsTag(a.tags, tag));
}
