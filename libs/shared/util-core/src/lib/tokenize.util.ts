/**
 * Full-text search tokenizer used to build richer Firestore search indices
 * (e.g. section/page `title` + `subTitle`). Output is a space-joined, lowercased,
 * deaccented, de-duplicated token string with common German + English stop words
 * removed. Substring-based search (no fuzzy matching) consumes the result.
 */

/** German + English stop words removed from the token stream. */
const STOP_WORDS = new Set([
  // German
  'der', 'die', 'das', 'und', 'oder', 'aber', 'ein', 'eine', 'einen', 'einem', 'einer', 'dem', 'den', 'des',
  'im', 'in', 'am', 'an', 'auf', 'aus', 'bei', 'fuer', 'mit', 'nach', 'von', 'vor', 'zu', 'zum', 'zur',
  'ist', 'sind', 'war', 'waren', 'nicht', 'auch', 'als', 'wie', 'es', 'er', 'sie', 'wir', 'ihr',
  // English
  'the', 'and', 'or', 'but', 'for', 'with', 'from', 'into', 'onto', 'of', 'to', 'in', 'on', 'at', 'by',
  'is', 'are', 'was', 'were', 'not', 'as', 'it', 'this', 'that', 'these', 'those', 'a', 'an'
]);

/** Removes diacritics via NFD normalization (ü → u, é → e). */
export function deaccent(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Builds a search-token string from arbitrary (possibly HTML) text.
 * @param text source text (may be undefined / contain HTML)
 * @param maxLength cap on the output length (default 1000, well under Firestore's indexed-field limit)
 */
export function buildSearchTokens(text: string | undefined, maxLength = 1000): string {
  if (!text) return '';
  const withoutTags = text.replace(/<[^>]*>/g, ' '); // strip HTML, keep word boundaries
  const normalized = deaccent(withoutTags.toLowerCase());
  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  let result = [...new Set(tokens)].join(' ');
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
    const lastSpace = result.lastIndexOf(' ');
    if (lastSpace > 0) result = result.slice(0, lastSpace); // drop a partial trailing token
  }
  return result;
}
